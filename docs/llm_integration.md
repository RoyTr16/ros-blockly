# LLM Integration

This document describes how the AI assistant is wired into the Blockly-based robotics GUI. It covers the end-to-end call flow, the dual-backend design (Gemini and Ollama), the system prompt strategy, the function/tool calling mechanism, the custom DSL (and why it exists), the compiler/decompiler pair, the modification protocol, and the safety nets in the UI.

All source lives under [client/src/ai/](../client/src/ai) and the chat UI at [client/src/components/ui/AiChat.jsx](../client/src/components/ui/AiChat.jsx).

---

## 1. High-level goals

The assistant has to do something that plain chat completion is poor at: **produce a valid Blockly workspace** for an arbitrary robotics request (ESP32 GPIO, UR5 arm, differential-drive vehicle, ultrasonic sensors, graphing, control flow, etc.), and let the user review the result before it is committed.

Design constraints that shaped the integration:

1. **No free-form code.** Blockly programs are a graph of typed, validated blocks. The model must never hand us JavaScript/Python — it must produce data that maps exactly onto known block types.
2. **Block catalogs are dynamic.** Hardware packages are loaded at runtime from [client/src/packages/builtin/](../client/src/packages/builtin) (`ur5.json`, `vehicle.json`, `esp32.json`, …). The prompt and tool schemas must be built from whatever packages are currently loaded.
3. **Two very different model classes.** Frontier cloud models (Gemini) tolerate a huge catalog in the prompt; small local models (Ollama / Qwen-class 7–8B) do not. The system must be economical with context for small models.
4. **Reversible edits.** The workspace must never be silently mutated — every tool call goes through a preview/apply/reject flow.
5. **Round-trippable state.** The model needs to see the *current* program so follow-up requests like "make it wait longer" can be resolved. That requires a decompiler from Blockly JSON back into a compact format.

---

## 2. Architecture at a glance

```
┌─────────────┐   user text    ┌───────────────┐
│  AiChat.jsx │ ─────────────▶ │  gemini.js /  │
│  (UI)       │  + workspace   │  ollama.js    │
│             │    DSL         │  (backend)    │
└─────┬───────┘                └───────┬───────┘
      │                                │
      │ toolCalls                      │ HTTP
      │ (create_program,               ▼
      │  modify_program)         ┌───────────────┐
      ▼                          │ Gemini API /  │
┌─────────────┐                  │ Ollama /api   │
│ dslCompiler │                  │   /chat       │
│  .js        │                  └───────────────┘
└─────┬───────┘
      │ Blockly JSON
      ▼
┌─────────────┐     preview     ┌───────────────┐
│ Blockly     │ ◀─────────────▶ │ user accepts  │
│ workspace   │   overlay       │ or rejects    │
└─────────────┘                 └───────────────┘
      │
      │ serialize (on next turn)
      ▼
┌─────────────┐
│ dslDecompiler│──▶ DSL string attached to next user message
└─────────────┘
```

Key files:

| File | Role |
| --- | --- |
| [client/src/ai/gemini.js](../client/src/ai/gemini.js) | Gemini backend: prompt + `functionDeclarations` tools. |
| [client/src/ai/ollama.js](../client/src/ai/ollama.js) | Ollama backend: agentic tool loop against `/api/chat`. |
| [client/src/ai/promptBuilder.js](../client/src/ai/promptBuilder.js) | Builds the system prompt and the block catalog/details lookups. |
| [client/src/ai/toolDefinitions.js](../client/src/ai/toolDefinitions.js) | Gemini function-calling schemas. |
| [client/src/ai/dslCompiler.js](../client/src/ai/dslCompiler.js) | DSL → Blockly workspace JSON. |
| [client/src/ai/dslDecompiler.js](../client/src/ai/dslDecompiler.js) | Blockly workspace JSON → DSL. |
| [client/src/components/ui/AiChat.jsx](../client/src/components/ui/AiChat.jsx) | Orchestrates chat, preview overlay, apply/reject. |

---

## 3. The DSL

A **Domain-Specific Language (DSL)** is a small, purpose-built notation designed for one narrow problem — as opposed to a general-purpose language like JavaScript or Python. DSLs trade generality for fit: by restricting what can be expressed, they become easier to read, easier to validate, and (critically here) easier for both humans and language models to produce correctly. Familiar examples include SQL (querying tables), regex (matching strings), and CSS selectors (picking DOM nodes).

In this project the DSL is a compact JSON shape that describes a Blockly program. It is the *only* interface between the language model and the workspace: the model emits DSL, the [compiler](../client/src/ai/dslCompiler.js) turns it into Blockly JSON, and the [decompiler](../client/src/ai/dslDecompiler.js) turns the current workspace back into DSL so the model can reason about it on the next turn. The rest of this section explains why that layer exists and how it is shaped.

### 3.1 Why a DSL at all?

Blockly's native serialization format is verbose and fragile. A single `wait_seconds` block looks something like:

```json
{
  "type": "wait_seconds",
  "id": "k9s...",
  "inputs": {
    "SECONDS": {
      "block": { "type": "math_number", "id": "p2q...", "fields": { "NUM": 1 } }
    }
  },
  "next": { "block": { ... } }
}
```

Every numeric input must be wrapped in a `math_number` block with its own id; every variable reference needs a `{ id, name, type }` tuple that matches a workspace-level variable registry; every `if` needs an `extraState.elseIfCount`; pins need an `esp32_gpio_pin` wrapper; `forever` doesn't exist natively and must be expressed as `controls_whileUntil WHILE true`. Asking a language model to emit this directly is a recipe for broken workspaces.

The DSL collapses all of that into something LLM-friendly:

```json
{ "type": "wait_seconds", "seconds": 1 }

{ "type": "forever", "body": [
  { "type": "esp32_set_pin_on",  "pin": 14 },
  { "type": "wait_seconds", "seconds": 0.5 },
  { "type": "esp32_set_pin_off", "pin": 14 },
  { "type": "wait_seconds", "seconds": 0.5 }
]}
```

The DSL's rules:

- A **program** is an array of **chains**; each chain is an array of sequentially connected statement blocks.
- **Numbers** are literals. **Variables** are bare strings (`"dist"`). **Pins** are numbers.
- **Expressions** are either a literal, a variable name, or a nested `{ type, ... }` object.
- **Loops / conditionals** carry their body as a nested array under `body` / `do0` / `else`.
- **Field values** are provided as lowercase keys (e.g. `joint_topic`, `op`, `mode`) matching the block's `args`.
- `forever` is sugar for `while true` — the compiler rewrites it.

Everything else — ids, variable registries, `extraState`, input wrappers, `next` links, expression-block boundaries — is the compiler's problem, not the model's.

### 3.2 The compiler ([dslCompiler.js](../client/src/ai/dslCompiler.js))

`compileDSL({ blocks: [...chains...] })` walks the DSL and emits a valid Blockly workspace JSON. Responsibilities:

- Monotonically-allocated block ids (`uid()`), stable within one compilation.
- Central `variables` map so every reference to `"dist"` resolves to the same `{ id, name, type }` tuple, and the workspace-level `variables` array is populated at the end.
- Per-block-type handling for all built-ins (`controls_if`, `controls_for`, `controls_whileUntil`, `math_arithmetic`, `variables_set/get`, `procedures_*`, graph utilities, …).
- A **generic handler** for package-defined blocks (`ur5_*`, `vehicle_*`, `esp32_*`, `rgb_led_*`, …). It inspects the block's `definition.args` to decide which DSL keys map to `fields` (dropdowns, numbers, variables) and which map to `inputs` (value slots, with a `check: "Pin"` / `"Number"` hint that decides the wrapping block type).
- Expression compilation (`compileExpression`) that auto-wraps literals in `math_number` / `logic_boolean` and auto-wraps strings as `variables_get`.
- Chain linking: statement blocks are linked via `next`; expression-only blocks (`math_*`, `logic_compare`, `variables_get`, `utilities_elapsed_time`) and standalone blocks (`utilities_graph_viewer`) are filtered out of chains and, for standalone ones, placed as separate top-level blocks.
- Alias tolerance: `if/then/else`, `ifTrue/thenDo/elseDo`, `graph_var`/`x_value`/`y_value`, `num` vs `value`, etc. This is defensive — small models consistently invent minor variations, and rejecting them leads to a worse UX than accepting them.

### 3.3 The decompiler ([dslDecompiler.js](../client/src/ai/dslDecompiler.js))

Before each user message we serialize the workspace and feed it back to the model as DSL so it has an accurate picture of the current program. `decompileDSL(workspaceJson)` does the inverse of the compiler:

- Builds a `varId → varName` map from `workspaceJson.variables` so variable fields resolve to readable names.
- Detects the `forever` sugar (a `controls_whileUntil` whose BOOL is a `logic_boolean TRUE`) and re-folds it.
- Collapses `math_number`, `logic_boolean`, `variables_get`, and `esp32_gpio_pin` into their scalar DSL forms.
- Falls back to a generic handler that re-reads `fieldDefs` / `inputDefs` from the package definition, so new hardware packages round-trip without any decompiler change.

The decompiler guarantees that a round-trip `compile → decompile` preserves the user's intent, not the raw JSON. That is what makes "modify the existing program" work: the DSL context is small, readable, and directly comparable to the DSL the model will emit.

---

## 4. The system prompt

The prompt is built by [`buildSystemPrompt(mode)`](../client/src/ai/promptBuilder.js) and differs sharply between backends.

### 4.1 Gemini — full catalog in prompt

Gemini receives the **full block catalog** for every loaded package, grouped by subcategory, with each block's `display_name`, `ai_description`, and DSL example. The prompt also contains:

- Explicit **response instructions** that forbid technical block type names in explanations (always "Set Pin ON", never `esp32_set_pin_on`). This matters because users are non-experts and are reading the chat, not the block palette.
- The DSL rules (literals, variable references as strings, pins as numbers, nested expression blocks).
- Two worked examples (`create_program` for a blink, `modify_program` for small edits).
- A reminder to always send a Markdown explanation alongside every tool call.

Rationale: frontier models with very large context windows don't benefit from making tool calls to "discover" block definitions — it just adds round trips, and a single-shot response is cheaper and faster.

### 4.2 Ollama — minimal prompt + agentic discovery

Small local models (~7–8B) have three failure modes when handed a giant catalog:

1. They hallucinate block types from the names alone.
2. They truncate or ignore later sections of the prompt.
3. They fail to follow multi-part response rules ("text + tool call").

So the Ollama prompt is aggressively trimmed:

- Only **category names** with a one-line description. No block types, no DSL examples per block.
- A tiny `<rules>` block: "programs are flat arrays", "loops have a body", "never invent types", "setup before loops".
- A `<workflow>` section that spells out a three-step loop:
  1. `get_category_blocks(category)` — list blocks in a category.
  2. `get_block_details(block_types)` — fetch exact DSL syntax.
  3. `create_program(blocks)` — emit the program.
- A single end-to-end example demonstrating the workflow.

Tool definitions themselves are **not** described in the prompt for Ollama — Ollama's `/api/chat` accepts a structured `tools` array and the schemas are authoritative. Duplicating them in prose confuses small models.

### 4.3 Why this split matters

Using the same prompt for both backends would either bloat Ollama (breaking it) or starve Gemini of context (making it slower and more error-prone via unnecessary tool rounds). `buildSystemPrompt` takes a `mode` argument precisely so each backend gets the shape it performs best on.

---

## 5. Tool / function calling

The assistant never returns raw program JSON as text. Programs are always the argument of a **tool call**. Both backends expose the same logical tools; only the transport differs.

### 5.1 Tools

| Tool | Purpose |
| --- | --- |
| `get_category_blocks` *(Ollama only)* | List the blocks inside a named category. Returns names + tooltips. |
| `get_block_details` | Return the exact DSL syntax (fields, inputs, examples) for a given list of block types. |
| `create_program` | Replace the workspace with a new program. Argument: an array of chains. |
| `modify_program` | Apply small, targeted edits to the existing program. Argument: an array of operations. |

### 5.2 Gemini transport

[`gemini.js`](../client/src/ai/gemini.js) posts to `v1beta/models/{model}:generateContent` with:

```js
{
  contents,                      // chat history
  systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
  tools: [{ functionDeclarations: buildToolDeclarations() }],
  toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  generationConfig: { temperature: 0.2, maxOutputTokens: 65536, thinkingConfig: {...} },
}
```

Tool schemas are built dynamically from the currently loaded packages (the `block_types` enum-as-description lists every real block type so the model can't invent names at the tool-call layer either). Arguments are declared as `STRING` holding a JSON payload; this sidesteps the API's nested-schema restrictions and matches what Gemini emits most reliably in practice.

The flow:

1. Send user message + decompiled DSL of the current workspace.
2. Parse response `parts`: skip `thought` parts, accumulate `text`, collect `functionCall`s.
3. If the only tool call is `get_block_details`, resolve it **client-side** (from `promptBuilder.getBlockDetails`) and send a `functionResponse` back to the model, then parse the second response. This is a one-shot two-turn exchange — the model sees the details and immediately emits `create_program`.
4. Return `{ text, toolCalls }` to the UI.

Finish-reason handling: `MAX_TOKENS` is surfaced as a user-visible "program too complex — try simpler" error rather than half a program.

### 5.3 Ollama transport — the agentic loop

Ollama's `/api/chat` supports native tools, but small models don't reliably get to `create_program` in one shot. [`ollama.js`](../client/src/ai/ollama.js) runs an explicit loop (up to `MAX_ROUNDS = 20`):

```
loop:
  call /api/chat with messages + tools
  if response has no tool_calls:
      if we nudged already or already have a program → break
      else nudge: "Call the create_program tool now. ..."
  else:
      for each tool_call:
          if get_category_blocks / get_block_details:
              execute locally, append role:"tool" result
          if create_program / modify_program:
              record it
      if we have a program → break
      (otherwise continue, letting the model chain more discovery calls)
```

Important details:

- **Discovery tools run in the browser.** `get_category_blocks` and `get_block_details` are answered by `promptBuilder` — they never hit the network. The model only ever sees the blocks that are actually present.
- **Argument sanitation.** Some Ollama-compatible runtimes emit `arguments` as a JSON string rather than an object; we `JSON.parse` when needed before appending to history.
- **The nudge.** If the model writes a text reply after discovery but forgets to call `create_program`, a single reminder user message is appended ("Call the create_program tool now…"). This dramatically improves success rates on Qwen-class models.
- **Chain normalization.** If the model hands us `blocks: [{type:...}]` (flat) instead of `[[{type:...}]]` (array of chains), or a stringified JSON payload, or `blocks: { blocks: [...] }`, we normalize it before returning.
- **Operation normalization.** For `modify_program`, small models often emit `{ set_field: {...} }` instead of `{ operations: [{ action: "set_field", ...}] }`. [`normalizeOperations`](../client/src/ai/ollama.js) reshapes common variants into the canonical form.
- **Context usage tracking.** `prompt_eval_count + eval_count` are surfaced in the UI against a fixed `num_ctx: 8192` so users can see when they're about to overflow a small model's window.
- **Explanation hygiene.** The loop accumulates any free-form text the model emits and, at the end, strips ```` ```json ```` fences and `<think>…</think>` blocks so the chat transcript stays clean.

### 5.4 Why client-side tool execution

`get_block_details` and `get_category_blocks` are effectively "RAG over the loaded package manifests". Executing them in the browser means:

- Zero additional API cost / latency.
- The answer is always consistent with what the compiler will accept.
- New hardware packages become visible to the LLM automatically — no prompt engineering required.

The more interesting tools (`create_program`, `modify_program`) are not executed by the model loop; the UI consumes them and drives Blockly.

---

## 6. `modify_program` — targeted edits

Regenerating the entire program for a change like "make the wait 0.1 s instead of 0.5" is wasteful and risks unrelated drift. `modify_program` accepts a small operation list applied directly to the serialized workspace JSON by [`applyModifications`](../client/src/components/ui/AiChat.jsx):

| Action | Effect |
| --- | --- |
| `set_field` | Overwrite a named field on the Nth occurrence of a block type. |
| `set_input` | Replace a value input with a new `math_number`. |
| `remove_block` | Splice a block out of its chain. A copy is stashed in `removedBlocks` keyed by type so a later `insert { block_type }` can restore it. |
| `add_after` | Compile a DSL sub-chain and splice it in after the target block. |
| `insert` | Insert a block (or standalone block like `utilities_graph_viewer`) at a chain/position, or as a new top-level chain. |

Occurrences are 0-indexed, and the walker descends into `next` and into every `inputs[*].block`, so nested blocks inside loops are reachable. If no match is found, the operation fails with a clear error instead of silently doing nothing.

---

## 7. The preview / apply / reject loop

Tool calls never mutate the workspace directly. Instead, `AiChat.jsx`:

1. Compiles the DSL (or applies the modifications) into a candidate Blockly JSON.
2. Saves the current workspace via `Blockly.serialization.workspaces.save`.
3. Loads the candidate JSON **as a preview overlay**, with an explicit Apply / Reject bar.
4. On **Reject**, the saved state is reloaded verbatim, cancelling the edit.
5. On **Apply**, the candidate becomes the new workspace and the saved state is dropped.

This flow exists because LLMs — especially small ones — sometimes produce programs that compile but don't match the user's intent. Making every edit reversible keeps the assistant useful without demanding trust.

There is also a `testLoad` step that tries to load the JSON, catches any Blockly exception, and restores the previous state — so broken programs surface as a chat error instead of a corrupted workspace.

---

## 8. Conversation state

Each backend keeps its own `chatHistory` array:

- **Gemini**: `{ role: 'user' | 'model', parts: [...] }` objects, including `functionCall` / `functionResponse` parts for the `get_block_details` round trip.
- **Ollama**: OpenAI-style `{ role: 'system' | 'user' | 'assistant' | 'tool', content, tool_calls? }` messages.

On every user turn, the current workspace DSL is appended to the user's message (`"Current program (DSL format):\n..."`). This is what lets follow-ups like "now also blink pin 15" work — the model sees what is already there, so `create_program` can preserve and extend it rather than starting fresh.

State is reset when:

- The user clicks **Clear chat**.
- The model or thinking-level is changed (to avoid leaking tool-call formats that no longer apply).
- A new API key / Ollama endpoint is set.

---

## 9. Extending the system

Adding a new hardware package is intentionally low-ceremony:

1. Drop a JSON manifest in [client/src/packages/builtin/](../client/src/packages/builtin) following the existing shape (`id`, `name`, `description`, optional `ai.subcategory_hints`, `blocks[]`).
2. Each block declares a `type`, `display_name`, `ai_description`, `ai_example`, and the standard Blockly `definition` (args, connections, tooltip).
3. The package loader registers the blocks with Blockly. The prompt builder, tool schemas, compiler's generic handler, and decompiler's generic handler all re-read the package catalog — **no AI-side code changes are needed** for the model to start using the new blocks.

Authoring tips for good AI behaviour:

- Always provide `ai_description` and `ai_example` — both are surfaced in `get_block_details`.
- Keep `display_name` human and short; it's what the model is instructed to use in explanations.
- Use `check: "Pin"` on pin inputs and `check: "Number"` on numeric inputs so the compiler wraps literals correctly.
- Prefer `field_dropdown` over free text for anything enumerable (joint names, topics, modes) — the prompt exposes the option values verbatim, making hallucinations impossible at that slot.

---

## 10. Summary of design choices

| Choice | Reason |
| --- | --- |
| Custom DSL between the model and Blockly | Blockly's native format is too verbose and too unforgiving for an LLM to emit reliably. |
| Dynamic, package-driven prompt & tool schemas | Adding hardware must not require touching the AI code. |
| Per-backend prompt shape (full catalog vs. categories + discovery) | Frontier and small models have opposite context economics. |
| Client-side execution of discovery tools | Zero latency, always consistent with the compiler. |
| Agentic loop with bounded rounds + nudge for Ollama | Small models need explicit scaffolding to reach the final tool call. |
| Tool-call-only program output (never raw JSON in text) | Keeps the protocol unambiguous and keeps parsing failures localized. |
| Separate `create_program` and `modify_program` | Small edits don't require regenerating (and potentially drifting) the whole program. |
| Decompile-on-turn so the model sees the current program as DSL | Makes conversational edits ("make it wait longer") natural and reliable. |
| Preview / Apply / Reject in the UI | Every change is reversible; the assistant never silently mutates the workspace. |
