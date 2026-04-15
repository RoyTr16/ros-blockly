// Builds system prompts and block detail lookups for AI backends.
// Phase 1 (system prompt): categories + block name + tooltip only (lightweight).
// Phase 2 (on-demand): full DSL syntax for specific blocks the model plans to use.

import { getLoadedPackages } from '../packages/PackageLoader';

// Lightweight block description: just type + display name + tooltip
function describeBlockBrief(blockDef) {
  const def = blockDef.definition;
  const tooltip = blockDef.ai_description || def.tooltip || def.message0 || '';
  const name = blockDef.display_name || '';
  return `  - **${blockDef.type}**${name ? ` ("${name}")` : ''}: ${tooltip}`;
}

// Full DSL description with all fields/inputs
function describeBlockDSL(blockDef) {
  const def = blockDef.definition;
  const allArgs = [];
  for (let i = 0; i < 10; i++) {
    if (def[`args${i}`]) allArgs.push(...def[`args${i}`]);
  }

  const dslProps = [];
  for (const f of allArgs.filter(a => a.type.startsWith('field_'))) {
    if (f.type === 'field_variable') {
      dslProps.push(`var: "${f.variable || 'item'}"`);
    } else if (f.type === 'field_dropdown') {
      const opts = f.options.map(o => `"${o[1]}"`).join(', ');
      dslProps.push(`${f.name.toLowerCase()}: one of [${opts}]`);
    } else if (f.type === 'field_number') {
      dslProps.push(`${f.name.toLowerCase()}: number`);
    } else {
      dslProps.push(`${f.name.toLowerCase()}: "text"`);
    }
  }
  for (const inp of allArgs.filter(a => a.type === 'input_value')) {
    const check = inp.check || 'any';
    dslProps.push(`${inp.name.toLowerCase()}: ${check === 'Pin' ? 'pin number' : 'number or expression'}`);
  }

  const tooltip = blockDef.ai_description || def.tooltip || '';
  let result = `- **${blockDef.type}**: ${tooltip}\n  DSL: { type: "${blockDef.type}", ${dslProps.join(', ')} }`;
  if (blockDef.ai_example) {
    result += `\n  Example: ${blockDef.ai_example}`;
  }
  return result;
}

// Build lightweight block catalog — categories + block names + tooltips
function buildBlockCatalog() {
  const packages = getLoadedPackages();
  let catalog = '';

  for (const [id, entry] of Object.entries(packages)) {
    const pkg = entry.pkg;
    const ai = pkg.ai || {};

    // Use subcategories from package if available
    if (pkg.category?.subcategories) {
      for (const sub of pkg.category.subcategories) {
        const hint = ai.subcategory_hints?.[sub.name] || '';
        catalog += `\n### ${pkg.name} > ${sub.name}${hint ? ` — ${hint}` : ''}\n`;
        const subBlockTypes = new Set(sub.blocks.map(b => b.type));
        for (const block of pkg.blocks) {
          if (subBlockTypes.has(block.type)) {
            catalog += describeBlockBrief(block) + '\n';
          }
        }
      }
      // Any blocks not in subcategories
      const categorized = new Set(pkg.category.subcategories.flatMap(s => s.blocks.map(b => b.type)));
      const uncategorized = pkg.blocks.filter(b => !categorized.has(b.type) && b.type !== 'esp32_gpio_pin');
      if (uncategorized.length) {
        catalog += `\n### ${pkg.name} > Other\n`;
        for (const block of uncategorized) {
          catalog += describeBlockBrief(block) + '\n';
        }
      }
    } else {
      catalog += `\n### ${pkg.name}\n`;
      if (ai.description) catalog += `${ai.description}\n`;
      for (const block of pkg.blocks) {
        catalog += describeBlockBrief(block) + '\n';
      }
    }
  }
  return catalog;
}

/**
 * Get full DSL syntax for specific block types (on-demand detail lookup).
 * Returns a formatted string with DSL syntax for each requested block type.
 */
export function getBlockDetails(blockTypes) {
  const packages = getLoadedPackages();
  const details = [];
  const found = new Set();

  for (const entry of Object.values(packages)) {
    for (const block of entry.pkg.blocks) {
      if (blockTypes.includes(block.type) && !found.has(block.type)) {
        details.push(describeBlockDSL(block));
        found.add(block.type);
      }
    }
  }

  // Also handle built-in blocks that aren't in packages
  const builtinDSL = {
    forever: '- **forever**: Infinite loop.\n  DSL: { type: "forever", body: [...blocks...] }',
    controls_repeat_ext: '- **controls_repeat_ext**: Repeat N times.\n  DSL: { type: "controls_repeat_ext", times: 10, body: [...] }',
    controls_for: '- **controls_for**: For loop.\n  DSL: { type: "controls_for", var: "counter", from: 0, to: 100, by: 1, body: [...] }',
    controls_whileUntil: '- **controls_whileUntil**: While/until.\n  DSL: { type: "controls_whileUntil", mode: "WHILE", condition: {expr}, body: [...] }',
    controls_if: '- **controls_if**: If/else-if/else.\n  DSL: { type: "controls_if", if0: {condition}, do0: [...], if1: {condition}, do1: [...], else: [...] }',
    logic_compare: '- **logic_compare**: Compare values.\n  DSL: { type: "logic_compare", op: "LT", a: {expr}, b: {expr} }\n  ops: "EQ", "NEQ", "LT", "LTE", "GT", "GTE"',
    logic_operation: '- **logic_operation**: AND/OR.\n  DSL: { type: "logic_operation", op: "AND", a: {expr}, b: {expr} }',
    logic_boolean: '- **logic_boolean**:\n  DSL: { type: "logic_boolean", value: true }',
    math_number: '- **math_number**: Literal number.\n  DSL: { type: "math_number", value: 42 }',
    math_arithmetic: '- **math_arithmetic**: Arithmetic.\n  DSL: { type: "math_arithmetic", op: "ADD", a: {expr}, b: {expr} }\n  ops: "ADD", "MINUS", "MULTIPLY", "DIVIDE", "POWER"',
    math_modulo: '- **math_modulo**: Modulo.\n  DSL: { type: "math_modulo", a: {expr}, b: {expr} }',
    variables_set: '- **variables_set**: Set variable.\n  DSL: { type: "variables_set", var: "myVar", value: {expr} }',
    variables_get: '- **variables_get**: Get variable.\n  DSL: { type: "variables_get", var: "myVar" }',
    procedures_defnoreturn: '- **procedures_defnoreturn**: Define function.\n  DSL: { type: "procedures_defnoreturn", name: "doSomething", body: [...] }',
    procedures_callnoreturn: '- **procedures_callnoreturn**: Call function.\n  DSL: { type: "procedures_callnoreturn", name: "doSomething" }',
    wait_seconds: '- **wait_seconds**: Delay.\n  DSL: { type: "wait_seconds", seconds: {expr} }\n  seconds can be a number or a variable reference like "myVar".',
    utilities_print: '- **utilities_print**: Log text.\n  DSL: { type: "utilities_print", text: "Value:", value: "myVar" }',
    utilities_elapsed_time: '- **utilities_elapsed_time**: Get elapsed seconds since program start.\n  DSL: { type: "utilities_elapsed_time" }\n  Use this as an expression, e.g. for graph X axis: "x": { type: "utilities_elapsed_time" } or shorthand "x": "elapsed_time"',
    controls_flow_statements: '- **controls_flow_statements**: Break/continue.\n  DSL: { type: "controls_flow_statements", flow: "BREAK" }',
    utilities_setup_graph: '- **utilities_setup_graph**: Create a graph. The "var" field names the graph variable.\n  DSL: { type: "utilities_setup_graph", var: "distGraph", x_label: "Time (s)", y_label: "Distance (cm)", color: "#4285f4", style: "line" }\n  color: "#4285f4" (Blue), "#ea4335" (Red), "#34a853" (Green), "#fbbc05" (Orange), "#9334e6" (Purple), "#00bcd4" (Cyan), "#e91e63" (Pink)\n  style: "line" or "scatter"',
    utilities_plot_point: '- **utilities_plot_point**: Add a data point to a graph. Use EXACTLY these keys: "var", "x", "y".\n  DSL: { type: "utilities_plot_point", var: "distGraph", x: { type: "utilities_elapsed_time" }, y: "dist" }\n  "var" must match the graph\'s var name. "x" and "y" are expressions (number, variable name, or nested block).',
    utilities_graph_viewer: '- **utilities_graph_viewer**: Show/hide a live chart (visual only).\n  DSL: { type: "utilities_graph_viewer", var: "distGraph" }',
  };

  for (const bt of blockTypes) {
    if (!found.has(bt) && builtinDSL[bt]) {
      details.push(builtinDSL[bt]);
      found.add(bt);
    }
  }

  return details.join('\n\n');
}

/**
 * Get all available block type names grouped by category (for tool descriptions).
 */
export function getAllBlockTypes() {
  const packages = getLoadedPackages();
  const types = [];
  for (const entry of Object.values(packages)) {
    for (const block of entry.pkg.blocks) {
      if (block.type !== 'esp32_gpio_pin') types.push(block.type);
    }
  }
  // Add built-in types
  types.push(
    'forever', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil',
    'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean',
    'math_number', 'math_arithmetic', 'math_modulo',
    'variables_set', 'variables_get',
    'procedures_defnoreturn', 'procedures_callnoreturn',
    'wait_seconds', 'utilities_print', 'utilities_elapsed_time', 'controls_flow_statements',
    'utilities_setup_graph', 'utilities_plot_point', 'utilities_graph_viewer',
  );
  return types;
}

export function buildSystemPrompt(mode = 'gemini') {
  const blockCatalog = buildBlockCatalog();

  const responseInstructions = mode === 'ollama'
    ? `## How to Respond
- Format all explanations using **Markdown**: use headings, bold, bullet lists, and \`inline code\` for block names.
- **CRITICAL**: NEVER use technical block type names in explanations. Always use the human-friendly display name shown in quotes next to each block in the catalog.
  - Say "**Setup Ultrasonic Sensor**" NOT "esp32_setup_ultrasonic"
  - Say "**Set Pin ON**" / "**Set Pin OFF**" NOT "esp32_set_pin_on" / "esp32_set_pin_off"
  - Say "**Forever Loop**" NOT "forever"
  - Say "**If/Else**" NOT "controls_if"
  - Say "**Compare**" NOT "logic_compare"
  - Say "**Print to Console**" NOT "utilities_print"
  - Say "**Wait**" NOT "wait_seconds"
  - Say "**Number**" NOT "math_number"
- When explaining a program, use the **actual variable names** from the program DSL context. Refer to variables with backticks and describe what they represent, e.g., "the distance stored in \`dist\`".
- For questions, explanations, greetings, or "what does this do?": respond with Markdown TEXT only. Do NOT call any tools.
- When the user asks to **create or modify** a program:
  1. First call **get_block_details** with the block types you plan to use, to get exact DSL syntax.
  2. Then call **create_program** (for new programs or large changes) or **modify_program** (for small changes) with the program DSL.
- **IMPORTANT**: Always include a Markdown explanation alongside every tool call. Describe what the program does in 2-3 sentences.
- If the user asks what a program does, describe it in Markdown. Do NOT call any tools.
- The current program is provided in DSL format. When modifying, use it as your starting point and apply only the requested changes.
- When regenerating a program with changes, include ALL the original blocks and logic, not just the parts you changed. The output replaces the entire workspace.`
    : `## How to Respond
- Format all explanations using **Markdown**: use headings, bold, bullet lists, and \`inline code\` for block names.
- **CRITICAL**: NEVER use technical block type names in explanations. Always use the human-friendly display name shown in quotes next to each block in the catalog.
  - Say "**Setup Ultrasonic Sensor**" NOT "esp32_setup_ultrasonic"
  - Say "**Set Pin ON**" / "**Set Pin OFF**" NOT "esp32_set_pin_on" / "esp32_set_pin_off"
  - Say "**Forever Loop**" NOT "forever"
  - Say "**If/Else**" NOT "controls_if"
  - Say "**Compare**" NOT "logic_compare"
  - Say "**Print to Console**" NOT "utilities_print"
  - Say "**Wait**" NOT "wait_seconds"
- When explaining a program, use the **actual variable names** from the program DSL context. Refer to variables with backticks and describe what they represent, e.g., "the distance stored in \`dist\`".
- For questions, explanations, greetings: respond with Markdown TEXT only. Do NOT call any tools.
- When the user asks to create a NEW program: call the **get_block_details** tool first if you need DSL syntax, then call the **create_program** tool.
- When the user asks to MODIFY the existing program: call **get_block_details** if needed, then call **modify_program** or **create_program** (for large changes).
- **IMPORTANT**: Always include a Markdown explanation alongside every tool call.`;

  const exampleSection = mode === 'ollama'
    ? `## create_program Tool
The "blocks" parameter is a JSON **array** of block chains. Each chain is an array of block objects.

### Example — Blink a pin:
create_program({ blocks: [
  [
    { type: "forever", body: [
      { type: "esp32_set_pin_on", pin: 14 },
      { type: "wait_seconds", seconds: 0.5 },
      { type: "esp32_set_pin_off", pin: 14 },
      { type: "wait_seconds", seconds: 0.5 }
    ]}
  ]
]})

### Example — Distance-based LED with math expressions:
create_program({ blocks: [
  [
    { type: "rgb_led_setup", var: "led1", r_pin: 27, g_pin: 14, b_pin: 12 },
    { type: "esp32_setup_ultrasonic", var: "dist", trig_pin: 17, echo_pin: 16 },
    { type: "forever", body: [
      { type: "rgb_led_set_color", var: "led1",
        red: { type: "math_arithmetic", op: "MINUS", a: 255, b: "dist" },
        green: 0,
        blue: "dist" },
      { type: "utilities_print", text: "Distance:", value: "dist" },
      { type: "wait_seconds", seconds: 0.1 }
    ]}
  ]
]})
Note: For inputs that depend on variables, use the variable name as a string (e.g., "dist"). For math, use nested objects like { type: "math_arithmetic", op: "MINUS", a: 255, b: "dist" }.

## modify_program Tool
The "operations" parameter is a JSON **array** of operation objects.
Use this for small changes. Each operation must have an "action" field. Operations:
- **set_field**: { action: "set_field", block_type: "esp32_set_pin_on", field: "PIN", value: "2" }
- **set_input**: { action: "set_input", block_type: "wait_seconds", input: "SECONDS", value: "0.05" }
- **remove_block**: { action: "remove_block", block_type: "wait_seconds", occurrence: 0 }
- **add_after**: { action: "add_after", block_type: "rgb_led_preset_color", blocks: [{...}], occurrence: 0 }
- **insert**: { action: "insert", block: { type: "utilities_graph_viewer", var: "myGraph" } } — adds a standalone block to the workspace
- **insert** (into chain): { action: "insert", chain: 0, position: 2, block: {...} } — inserts into an existing chain at position

## get_block_details Tool
Call this BEFORE creating a program to get the exact DSL syntax for blocks you plan to use.
Pass an array of block type names. The system returns their DSL format, fields, and inputs.
Example: get_block_details({ block_types: ["esp32_set_pin_on", "esp32_setup_ultrasonic"] })

## Modifying a Program
When the user asks to change, fix, or modify the existing program, **regenerate the complete program** via the **create_program** tool.
Include ALL original blocks and logic — the output replaces the entire workspace.
Only apply the specific changes the user asked for; keep everything else the same.`
    : `## create_program Tool
The "blocks" parameter is a **JSON string** (not an object). Encode the blocks array as a JSON string.
The blocks array contains chains. Each chain is an array of sequential blocks.

### Example — Blink a pin:
create_program({ blocks: JSON.stringify([
  [
    { type: "forever", body: [
      { type: "esp32_set_pin_on", pin: 14 },
      { type: "wait_seconds", seconds: 0.5 },
      { type: "esp32_set_pin_off", pin: 14 },
      { type: "wait_seconds", seconds: 0.5 }
    ]}
  ]
])})

### Example — Distance-based LED:
create_program({ blocks: JSON.stringify([
  [
    { type: "rgb_led_setup", var: "led1", r_pin: 27, g_pin: 14, b_pin: 12 },
    { type: "esp32_setup_ultrasonic", var: "dist", trig_pin: 17, echo_pin: 16 },
    { type: "forever", body: [
      { type: "rgb_led_set_color", var: "led1", red: "intensity", green: 0, blue: { type: "math_arithmetic", op: "MINUS", a: 255, b: "intensity" } },
      { type: "wait_seconds", seconds: 0.02 }
    ]}
  ]
])})

## modify_program Tool
The "operations" parameter is a **JSON string** encoding an array of operations.
Use this for small changes.
Operations:
- **set_field**: { action: "set_field", block_type: "esp32_set_pin_on", field: "PIN", value: "2" }
- **set_input**: { action: "set_input", block_type: "wait_seconds", input: "SECONDS", value: "0.05" }
- **remove_block**: { action: "remove_block", block_type: "wait_seconds", occurrence: 0 }
- **add_after**: { action: "add_after", block_type: "rgb_led_preset_color", blocks: [{...}], occurrence: 0 }
- **insert**: { action: "insert", block: { type: "utilities_graph_viewer", var: "myGraph" } } — adds a standalone block to the workspace
- **insert** (into chain): { action: "insert", chain: 0, position: 2, block: {...} } — inserts into an existing chain at position

## get_block_details Tool
Call this BEFORE creating a program to get the exact DSL syntax for blocks you plan to use.
Pass an array of block type names. The system returns their DSL format, fields, and inputs.
Example: get_block_details({ block_types: '["esp32_set_pin_on", "esp32_setup_ultrasonic"]' })`;

  return `You are a friendly Blockly programming assistant for a robotics control GUI.
You help users create and modify visual block programs.

${responseInstructions}

## Available Block Categories
These are the blocks available in the workspace. Each entry shows the block type and what it does.
When you need the exact DSL syntax for a block, call the **get_block_details** tool.
${blockCatalog}

## Built-in Control Blocks
### Loops
  - **forever** ("Forever Loop"): Infinite loop
  - **controls_repeat_ext** ("Repeat N Times"): Repeat N times
  - **controls_for** ("For Loop"): For loop with counter variable
  - **controls_whileUntil** ("While/Until Loop"): While/until condition loop

### Logic
  - **controls_if** ("If/Else"): If/else-if/else branching
  - **logic_compare** ("Compare"): Compare two values (EQ, NEQ, LT, LTE, GT, GTE)
  - **logic_operation** ("AND/OR"): AND/OR logic
  - **logic_boolean** ("True/False"): True/false constant

### Math
  - **math_number** ("Number"): Literal number
  - **math_arithmetic** ("Math Operation"): Arithmetic (ADD, MINUS, MULTIPLY, DIVIDE, POWER)
  - **math_modulo** ("Modulo"): Modulo operation

### Variables
  - **variables_set** ("Set Variable"): Set a variable value
  - **variables_get** ("Get Variable"): Get a variable value
  - Variable references in expressions: just use the variable name as a string (e.g., "led1")

### Functions
  - **procedures_defnoreturn** ("Define Function"): Define a function
  - **procedures_callnoreturn** ("Call Function"): Call a function

### Utilities
  - **wait_seconds** ("Wait"): Delay execution
  - **utilities_print** ("Print to Console"): Log text and values
  - **utilities_elapsed_time** ("Elapsed Time"): Get elapsed seconds
  - **controls_flow_statements** ("Break/Continue"): Break/continue

### Graphing
  - **utilities_setup_graph** ("Setup Graph"): Create a named graph with axis labels, color, and style. Stores graph in a variable.
  - **utilities_plot_point** ("Plot Point"): Add an (x, y) data point to a graph variable.
  - **utilities_graph_viewer** ("Graph Viewer"): Show/hide a live chart for a graph variable (visual only).

${exampleSection}

## Key Rules
- For hardware blocks with VAR: always use the same var name as the setup block (e.g., "led1" everywhere).
- Pin inputs: just use the pin number (e.g., 27). The compiler creates the proper pin block.
- Number inputs: just use a literal number. The compiler wraps it in math_number.
- Expression inputs: use a nested block object for complex expressions (e.g., math_arithmetic).
- Variable references in expressions: use the variable name as a string (e.g., "intensity").
- Do NOT invent block types. Only use blocks from the catalog above.
- ALL programs MUST use this DSL JSON format. Never output JavaScript, Python, or other code.`;
}
