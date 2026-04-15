// Ollama backend — native tool calling via /api/chat
// Flow: model calls get_block_details → then create_program or modify_program

import { buildSystemPrompt, getBlockDetails, getAllBlockTypes, getCategoryBlocks } from './promptBuilder';

const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen3:8b';

let ollamaUrl = null;
let model = DEFAULT_MODEL;
let chatHistory = [];
let lastContextUsage = null; // Track token usage from last API call

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
  lastContextUsage = null;
}

export function getModel() {
  return model;
}

export function getContextUsage() {
  if (!lastContextUsage) return null;
  const numCtx = 8192;
  return { ...lastContextUsage, numCtx, percent: Math.round((lastContextUsage.total / numCtx) * 100) };
}

export function setModel(m) {
  model = m;
  chatHistory = [];
}

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

// ── Tool declarations with proper JSON schemas ──

function buildTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'get_category_blocks',
        description: 'List available blocks in a category. Call this to discover what blocks exist.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Category name (e.g., "UR5 Robot Arm", "Loops", "Utilities").',
            },
          },
          required: ['category'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_block_details',
        description: 'Get the exact DSL syntax for specific block types. Call after get_category_blocks.',
        parameters: {
          type: 'object',
          properties: {
            block_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Block type names to look up.',
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
        description: 'Create a Blockly program from a sequence of blocks. Example: [{type:"wait_seconds",seconds:1},{type:"ur5_move_single_joint",joint_topic:"/shoulder_pan",position:0.5}]',
        parameters: {
          type: 'object',
          properties: {
            blocks: {
              type: 'array',
              description: 'Array of block objects to place sequentially.',
              items: { type: 'object' },
            },
          },
          required: ['blocks'],
        },
      },
    },
  ];
}

// ── Core Ollama API call ──

async function callOllama(messages, tools = null) {
  const body = {
    model,
    stream: false,
    messages,
    options: { temperature: 0.1, num_predict: 4096, num_ctx: 8192, top_p: 0.9, repeat_penalty: 1.1 },
  };
  if (tools) body.tools = tools;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let res;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Ollama request timed out (120s).');
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ollama API error ${res.status}`);
  }

  const data = await res.json();
  // Track token usage for context display
  if (data.prompt_eval_count || data.eval_count) {
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;
    lastContextUsage = { promptTokens, completionTokens, total: promptTokens + completionTokens };
  }
  return data.message || { role: 'assistant', content: '' };
}

// ── Local tool execution ──

function executeToolCall(name, args) {
  if (name === 'get_category_blocks') {
    const category = args.category || '';
    return getCategoryBlocks(category);
  }
  if (name === 'get_block_details') {
    const blockTypes = Array.isArray(args.block_types)
      ? args.block_types
      : typeof args.block_types === 'string'
        ? JSON.parse(args.block_types)
        : [args.block_types];
    return getBlockDetails(blockTypes) || 'No details found.';
  }
  return null;
}

// ── Normalize modify_program operations ──

function normalizeOperations(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.operations)) return raw.operations;
  if (raw.action) return [raw];
  const KNOWN = ['set_field', 'set_input', 'remove_block', 'add_after', 'insert'];
  const ops = [];
  for (const key of KNOWN) {
    if (raw[key]) ops.push({ action: key, ...(typeof raw[key] === 'object' ? raw[key] : {}) });
  }
  return ops;
}

// ── Main entry point ──

export async function sendMessage(userMessage, currentWorkspaceCode = null, _opts = {}) {
  if (!ollamaUrl) throw new Error('Ollama not initialized. Set the Ollama URL.');

  let fullMessage = userMessage;
  if (currentWorkspaceCode) {
    fullMessage += `\n\nCurrent program:\n\`\`\`json\n${currentWorkspaceCode}\n\`\`\``;
  }

  chatHistory.push({ role: 'user', content: fullMessage });

  const systemPrompt = buildSystemPrompt('ollama');
  const tools = buildTools();
  const buildMessages = () => [{ role: 'system', content: systemPrompt }, ...chatHistory];

  console.log('[Ollama] Model:', model, '| System prompt:', systemPrompt.length, 'chars | Tools:', tools.length);

  let response;
  try {
    response = await callOllama(buildMessages(), tools);
  } catch (e) {
    chatHistory.pop();
    if (e.message.includes('API error') || e.message.includes('timed out')) throw e;
    throw new Error(`Cannot reach Ollama at ${ollamaUrl}. Make sure Ollama is running with OLLAMA_ORIGINS=*.`);
  }

  // Agentic tool loop — model keeps calling tools until it's done.
  // Safety limit prevents infinite loops, but is set high enough to never be the bottleneck.
  const MAX_ROUNDS = 20;
  let rounds = 0;
  let explanation = response.content || '';
  const programCalls = [];

  console.log('[Ollama] Round 0:', {
    content: response.content?.length || 0,
    toolCalls: response.tool_calls?.length || 0,
    tools: response.tool_calls?.map(tc => tc.function?.name) || [],
  });

  let nudged = false;

  while (rounds < MAX_ROUNDS) {
    // No tool calls — check if we should nudge or stop
    if (!response.tool_calls?.length) {
      // If discovery happened but no program was created yet, nudge once
      if (!nudged && rounds > 0 && programCalls.length === 0) {
        nudged = true;
        console.log(`[Ollama] Round ${rounds}: no create_program after discovery, nudging...`);
        // Keep any text the model wrote as explanation
        if (response.content) {
          explanation = (explanation + '\n\n' + response.content).trim();
          chatHistory.push({ role: 'assistant', content: response.content });
        }
        chatHistory.push({
          role: 'user',
          content: 'Call the create_program tool now. Pass blocks as an array of objects, e.g. blocks: [{type:"wait_seconds",seconds:1}]',
        });
        try {
          response = await callOllama(buildMessages(), tools);
          rounds++;
          console.log(`[Ollama] Round ${rounds} (nudge):`, {
            content: response.content?.length || 0,
            toolCalls: response.tool_calls?.length || 0,
            tools: response.tool_calls?.map(tc => tc.function?.name) || [],
          });
          continue;
        } catch { break; }
      }
      // Model gave a text response or we already have program calls — done
      break;
    }

    rounds++;

    // Sanitize tool_calls: ensure arguments are objects, not strings
    const sanitizedToolCalls = response.tool_calls.map(tc => ({
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments,
      },
    }));

    chatHistory.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: sanitizedToolCalls,
    });

    for (const tc of response.tool_calls) {
      const fn = tc.function;

      if (fn.name === 'get_category_blocks' || fn.name === 'get_block_details') {
        const result = executeToolCall(fn.name, fn.arguments);
        chatHistory.push({ role: 'tool', content: result });
      } else if (fn.name === 'create_program' || fn.name === 'modify_program') {
        console.log(`[Ollama] Tool: ${fn.name}`, JSON.stringify(fn.arguments).slice(0, 500));
        programCalls.push({ name: fn.name, args: fn.arguments });
      }
    }

    // Got a program — stop the loop, no need to call Ollama again
    if (programCalls.length > 0) break;

    try {
      response = await callOllama(buildMessages(), tools);
    } catch {
      break;
    }

    console.log(`[Ollama] Round ${rounds}:`, {
      content: response.content?.length || 0,
      toolCalls: response.tool_calls?.length || 0,
      tools: response.tool_calls?.map(tc => tc.function?.name) || [],
    });

    if (response.content) {
      explanation = (explanation + '\n\n' + response.content).trim();
    }
  }

  if (rounds >= MAX_ROUNDS) {
    console.warn('[Ollama] Hit safety limit of', MAX_ROUNDS, 'rounds');
  }

  // Record final assistant message
  if (!response.tool_calls?.length && response.content) {
    chatHistory.push({ role: 'assistant', content: response.content });
    // Only add if not already captured (avoid duplicates for single-round text responses)
    if (!explanation.includes(response.content)) {
      explanation = (explanation ? explanation + '\n\n' + response.content : response.content).trim();
    }
  }

  // Parse tool calls into standard format
  const toolCalls = [];
  for (const pc of programCalls) {
    try {
      if (pc.name === 'create_program') {
        let blocks = pc.args.blocks;
        if (typeof blocks === 'string') blocks = JSON.parse(blocks);
        if (blocks && !Array.isArray(blocks) && Array.isArray(blocks.blocks)) blocks = blocks.blocks;
        // Single chain → wrap
        if (Array.isArray(blocks) && blocks.length > 0 && !Array.isArray(blocks[0]) && blocks[0]?.type) {
          blocks = [blocks];
        }
        if (Array.isArray(blocks)) {
          toolCalls.push({ name: 'create_program', args: { blocks } });
        }
      } else if (pc.name === 'modify_program') {
        let operations = pc.args.operations;
        if (typeof operations === 'string') operations = JSON.parse(operations);
        operations = normalizeOperations(operations);
        if (operations.length > 0) {
          toolCalls.push({ name: 'modify_program', args: { operations } });
        }
      }
    } catch (e) {
      console.warn('[Ollama] Failed to parse tool args:', e.message);
    }
  }

  const cleanExplanation = explanation
    .replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();

  return { text: cleanExplanation, toolCalls, contextUsage: getContextUsage() };
}
