// Ollama backend — native tool calling pipeline:
// Model calls get_block_details to learn DSL syntax, then create_program/modify_program to generate

import { buildSystemPrompt, getBlockDetails, getAllBlockTypes } from './promptBuilder';

const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen3:8b';

let ollamaUrl = null;
let model = DEFAULT_MODEL;
let chatHistory = []; // { role: 'user'|'assistant'|'tool', content: string, tool_calls?: [...] }

export function initOllama(url, modelName) {
  ollamaUrl = url.replace(/\/$/, '');
  model = modelName || DEFAULT_MODEL;
  chatHistory = [];
}

export function isInitialized() {
  return ollamaUrl !== null;
}

export function resetChat() {
  chatHistory = [];
}

export function getModel() {
  return model;
}

export function setModel(m) {
  model = m;
  chatHistory = [];
}

// Fetch available models from the Ollama instance
export async function listModels() {
  if (!ollamaUrl) return [];
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

// Build Ollama-format tool declarations
function buildOllamaTools() {
  const allTypes = getAllBlockTypes();
  return [
    {
      type: 'function',
      function: {
        name: 'get_block_details',
        description: 'Get the exact DSL syntax for specific block types before creating a program. Call this first to learn the fields and inputs for blocks you plan to use.',
        parameters: {
          type: 'object',
          properties: {
            block_types: {
              type: 'array',
              items: { type: 'string', enum: allTypes },
              description: 'Array of block type names to get details for.',
            },
          },
          required: ['block_types'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_program',
        description: 'Create a new Blockly program from a blocks array.',
        parameters: {
          type: 'object',
          properties: {
            blocks: {
              type: 'array',
              description: 'Array of block chains. Each chain is an array of block objects. Each block has a "type" string and additional fields.',
              items: {
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
          required: ['blocks'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'modify_program',
        description: 'Apply targeted modifications to the current program.',
        parameters: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              description: 'Array of modification operations.',
              items: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['set_field', 'set_input', 'remove_block', 'add_after', 'insert'],
                    description: 'The modification action to perform.',
                  },
                  block_type: { type: 'string', description: 'Target block type (for set_field, set_input, remove_block, add_after).' },
                  occurrence: { type: 'integer', description: 'Which occurrence of block_type to target (0-indexed, default 0).' },
                  field: { type: 'string', description: 'Field name (for set_field).' },
                  input: { type: 'string', description: 'Input name (for set_input).' },
                  value: { type: 'string', description: 'New value (for set_field, set_input).' },
                  block: { type: 'object', description: 'Block DSL object to insert.' },
                  blocks: { type: 'array', items: { type: 'object' }, description: 'Array of block DSL objects (for add_after).' },
                },
                required: ['action'],
              },
            },
          },
          required: ['operations'],
        },
      },
    },
  ];
}

// Core API call to Ollama with optional tools
async function callOllama(messages, { tools = null, think = false } = {}) {
  const body = {
    model,
    stream: false,
    messages,
    options: {
      temperature: 0.2,
      num_predict: 8192,
    },
  };
  if (tools) body.tools = tools;
  if (think) body.think = true;

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ollama API error ${res.status}`);
  }

  const data = await res.json();
  return data.message || { role: 'assistant', content: '' };
}

// Execute a tool call locally and return the result
function executeToolCall(name, args) {
  if (name === 'get_block_details') {
    try {
      const blockTypes = Array.isArray(args.block_types)
        ? args.block_types
        : typeof args.block_types === 'string'
          ? JSON.parse(args.block_types)
          : [args.block_types];
      const details = getBlockDetails(Array.isArray(blockTypes) ? blockTypes : [blockTypes]);
      return details || 'No details found for the requested block types.';
    } catch (e) {
      return `Error parsing block_types: ${e.message}`;
    }
  }
  // create_program and modify_program are handled by the caller
  return null;
}

// Normalize modify_program operations from the many formats the model might produce
// Expected: [{action: "insert", block: {...}}, ...]
// Model might send:
//   1. Array of ops (correct): [{action: "insert", ...}]
//   2. Double-wrapped: {operations: [...]} → extract .operations
//   3. Single op object: {action: "insert", block: {...}} → wrap in array
//   4. Action-as-key: {insert: {block: {...}}} → [{action: "insert", block: {...}}]
//   5. Action-as-key with nested value: {set_field: {block_type: "...", field: "...", value: "..."}}
function normalizeOperations(raw) {
  if (!raw || typeof raw !== 'object') return [];
  // Already an array
  if (Array.isArray(raw)) return raw;
  // Double-wrapped: { operations: [...] }
  if (Array.isArray(raw.operations)) return raw.operations;
  // Single op with action field: { action: "insert", ... }
  if (raw.action) return [raw];
  // Action-as-key: { insert: { block: {...} } } or { set_field: { block_type: "...", ... } }
  const KNOWN_ACTIONS = ['set_field', 'set_input', 'remove_block', 'add_after', 'insert', 'add_block'];
  const ops = [];
  for (const key of KNOWN_ACTIONS) {
    if (raw[key]) {
      const val = typeof raw[key] === 'object' ? raw[key] : {};
      ops.push({ action: key, ...val });
    }
  }
  if (ops.length > 0) return ops;
  // Give up
  console.warn('[Ollama] Could not normalize operations:', JSON.stringify(raw));
  return [];
}

// Send a message and return { text, toolCalls } (same interface as gemini.js)
export async function sendMessage(userMessage, currentWorkspaceCode = null, _opts = {}) {
  if (!ollamaUrl) throw new Error('Ollama not initialized. Set the Ollama URL.');

  let fullMessage = userMessage;
  if (currentWorkspaceCode) {
    fullMessage += `\n\nCurrent program (DSL format — same format you should output):\n\`\`\`json\n${currentWorkspaceCode}\n\`\`\``;
  }

  chatHistory.push({ role: 'user', content: fullMessage });

  const systemPrompt = buildSystemPrompt('ollama');
  const tools = buildOllamaTools();

  const buildMessages = () => [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
  ];

  let response;
  try {
    response = await callOllama(buildMessages(), { tools });
  } catch (e) {
    chatHistory.pop();
    if (e.message.includes('API error')) throw e;
    throw new Error(`Cannot reach Ollama at ${ollamaUrl}. Make sure the Ollama container is running and CORS is enabled (OLLAMA_ORIGINS=*).`);
  }

  // Tool calling loop: handle get_block_details calls, then let model continue
  const MAX_ROUNDS = 3;
  let rounds = 0;
  let explanation = response.content || '';
  const programToolCalls = [];

  while (response.tool_calls && response.tool_calls.length > 0 && rounds < MAX_ROUNDS) {
    rounds++;

    // Add assistant message with tool calls to history
    chatHistory.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.tool_calls,
    });

    let hasGetDetails = false;
    for (const tc of response.tool_calls) {
      const fn = tc.function;
      if (fn.name === 'get_block_details') {
        hasGetDetails = true;
        const result = executeToolCall(fn.name, fn.arguments);
        chatHistory.push({
          role: 'tool',
          content: result,
        });
      } else if (fn.name === 'create_program' || fn.name === 'modify_program') {
        console.log(`[Ollama] Tool call: ${fn.name}`, JSON.stringify(fn.arguments).slice(0, 500));
        programToolCalls.push({ name: fn.name, args: fn.arguments });
      }
    }

    // If there were only program tool calls (no get_block_details), we're done
    if (!hasGetDetails) break;

    // Continue the conversation — model should now generate the program
    try {
      response = await callOllama(buildMessages(), { tools });
    } catch {
      break;
    }

    // Accumulate explanation text
    if (response.content) {
      explanation = (explanation + '\n\n' + response.content).trim();
    }
  }

  // If no tool calls found in the loop, check the final response for program calls
  if (programToolCalls.length === 0 && response.tool_calls) {
    for (const tc of response.tool_calls) {
      const fn = tc.function;
      if (fn.name === 'create_program' || fn.name === 'modify_program') {
        console.log(`[Ollama] Final tool call: ${fn.name}`, JSON.stringify(fn.arguments).slice(0, 500));
        programToolCalls.push({ name: fn.name, args: fn.arguments });
      }
    }
  }

  // Add final assistant message to history
  if (!response.tool_calls || response.tool_calls.length === 0) {
    chatHistory.push({ role: 'assistant', content: response.content || '' });
    if (response.content) {
      explanation = (explanation ? explanation + '\n\n' + response.content : response.content).trim();
    }
  }

  // Parse program tool calls into our standard format
  const toolCalls = [];
  for (const ptc of programToolCalls) {
    try {
      if (ptc.name === 'create_program') {
        let blocks = ptc.args.blocks;
        // If model still sends a string despite schema, parse it
        if (typeof blocks === 'string') blocks = JSON.parse(blocks);
        // Unwrap double-wrapped: { blocks: [...] } → [...]
        if (blocks && !Array.isArray(blocks) && Array.isArray(blocks.blocks)) {
          blocks = blocks.blocks;
        }
        if (Array.isArray(blocks)) {
          toolCalls.push({ name: 'create_program', args: { blocks } });
        }
      } else if (ptc.name === 'modify_program') {
        let operations = ptc.args.operations;
        // If model still sends a string despite schema, parse it
        if (typeof operations === 'string') operations = JSON.parse(operations);
        // Normalize from the many formats the model might produce
        operations = normalizeOperations(operations);
        if (Array.isArray(operations) && operations.length > 0) {
          toolCalls.push({ name: 'modify_program', args: { operations } });
        }
      }
    } catch (e) {
      console.warn('[Ollama] Failed to parse tool call args:', e.message);
    }
  }

  // Also try to extract DSL from text content as fallback (model may output JSON in text)
  if (toolCalls.length === 0 && explanation) {
    const match = explanation.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(c => Array.isArray(c) && c[0]?.type)) {
          toolCalls.push({ name: 'create_program', args: { blocks: parsed } });
        }
      } catch { /* ignore */ }
    }
  }

  // Clean up explanation: remove JSON code blocks
  const cleanExplanation = explanation
    .replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();

  return { text: cleanExplanation, toolCalls };
}
