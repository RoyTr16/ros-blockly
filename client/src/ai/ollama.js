// Ollama backend — two-phase pipeline:
// Phase 1: Model reads lightweight catalog + picks blocks it needs
// Phase 2: System injects DSL syntax → model generates the program

import { buildSystemPrompt, getBlockDetails, getAllBlockTypes } from './promptBuilder';

const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5-coder:7b';

let ollamaUrl = null;
let model = DEFAULT_MODEL;
let chatHistory = []; // { role: 'user'|'assistant', content: string }

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

// Extract DSL JSON from a ```json code block in the response
// Only returns data if it looks like a valid DSL program (array of block chains) or modification
function extractDSL(text) {
  // Match ```json or plain ``` code fences
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    // Validate structure: must be array-of-arrays with {type} objects, or {blocks}, or {operations}
    if (Array.isArray(parsed)) {
      // Check that it looks like block chains: [[{type:...}, ...], ...]
      const isBlockChains = parsed.length > 0 && parsed.every(chain =>
        Array.isArray(chain) && chain.length > 0 && chain[0]?.type
      );
      return isBlockChains ? parsed : null;
    }
    if (parsed?.blocks && Array.isArray(parsed.blocks)) return parsed;
    if (parsed?.operations && Array.isArray(parsed.operations)) return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

// Extract block type names mentioned in the response text
function extractRequestedBlocks(text) {
  const allTypes = getAllBlockTypes();
  const found = new Set();
  for (const t of allTypes) {
    if (text.includes(t)) found.add(t);
  }
  return [...found];
}

// Core API call to Ollama
async function callOllama(messages) {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      options: {
        temperature: 0.2,
        num_predict: 8192,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ollama API error ${res.status}`);
  }

  const data = await res.json();
  return data.message?.content || '';
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
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
  ];

  let content;
  try {
    content = await callOllama(allMessages);
  } catch (e) {
    chatHistory.pop();
    if (e.message.includes('API error')) throw e;
    throw new Error(`Cannot reach Ollama at ${ollamaUrl}. Make sure the Ollama container is running and CORS is enabled (OLLAMA_ORIGINS=*).`);
  }

  // Detect question-only messages early — suppress program generation
  const questionOnly = /^\s*(what|how|why|explain|describe|tell me about)\b/i.test(userMessage)
    && !/\b(and |then |but |also |change|make|fix|add|create|build|modify|update|set|remove)\b/i.test(userMessage);

  // Phase 1: Check if the model produced a program directly
  let dsl = questionOnly ? null : extractDSL(content);

  // If no DSL yet but the model mentioned block types → inject syntax + ask for program (Phase 2)
  if (!dsl && !questionOnly) {
    const requestedBlocks = extractRequestedBlocks(content);
    if (requestedBlocks.length > 0) {
      console.log('[Ollama] Phase 2: injecting DSL syntax for:', requestedBlocks);
      const details = getBlockDetails(requestedBlocks);
      if (details) {
        chatHistory.push({ role: 'assistant', content });
        const syntaxInjection = `Here is the DSL syntax for the blocks you selected:\n\n${details}\n\nNow output ONLY the complete program as a \`\`\`json code block. Do not repeat the explanation.`;
        chatHistory.push({ role: 'user', content: syntaxInjection });

        try {
          const phase2Content = await callOllama([
            { role: 'system', content: systemPrompt },
            ...chatHistory,
          ]);
          dsl = extractDSL(phase2Content);
          if (!dsl) console.warn('[Ollama] Phase 2 produced no valid DSL. Response:', phase2Content.substring(0, 500));

          // Clean up history: replace phase1+injection with final response
          chatHistory.pop(); // remove syntax injection
          chatHistory.pop(); // remove phase 1 response
          // Preserve phase 1 explanation, append phase 2 program
          const phase1Explanation = content.replace(/I'll use[:\s]+[\w\s,_]+/i, '').trim();
          const phase2Explanation = phase2Content.replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '').trim();
          content = [phase1Explanation, phase2Explanation, phase2Content.match(/```(?:json)?\s*\n?[\s\S]*?```/)?.[0] || ''].filter(Boolean).join('\n\n');
          chatHistory.push({ role: 'assistant', content: phase2Content });
        } catch {
          chatHistory.pop();
          chatHistory.pop();
          chatHistory.push({ role: 'assistant', content });
        }
      } else {
        chatHistory.push({ role: 'assistant', content });
      }
    } else {
      chatHistory.push({ role: 'assistant', content });
    }
  } else {
    chatHistory.push({ role: 'assistant', content });
  }

  // Build tool calls from DSL
  const toolCalls = [];
  if (dsl && !questionOnly) {
    if (Array.isArray(dsl)) {
      toolCalls.push({ name: 'create_program', args: { blocks: dsl } });
    } else if (dsl.blocks) {
      toolCalls.push({ name: 'create_program', args: { blocks: dsl.blocks } });
    } else if (dsl.operations) {
      toolCalls.push({ name: 'modify_program', args: { operations: dsl.operations } });
    }
  }

  // Clean up explanation: remove JSON code blocks and "I'll use:" block selection text
  const explanation = content
    .replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '')
    .replace(/I'll use[:\s]+[\w\s,_]+$/im, '')
    .trim();
  return { text: explanation, toolCalls };
}
