// Ollama backend — uses code-block extraction instead of tool calling
// for broad model compatibility. The LLM outputs DSL JSON in a ```json block.

import { buildSystemPrompt } from './promptBuilder';

const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.1';

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
function extractDSL(text) {
  // Look for ```json ... ``` blocks
  const match = text.match(/```json\s*\n?([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return null;
  }
}

// Send a message and return { text, toolCalls } (same interface as gemini.js)
export async function sendMessage(userMessage, currentWorkspaceCode = null) {
  if (!ollamaUrl) throw new Error('Ollama not initialized. Set the Ollama URL.');

  let fullMessage = userMessage;
  if (currentWorkspaceCode) {
    fullMessage += `\n\nCurrent program (generated JavaScript):\n\`\`\`javascript\n${currentWorkspaceCode}\n\`\`\``;
  }

  chatHistory.push({ role: 'user', content: fullMessage });

  const systemPrompt = buildSystemPrompt('ollama');

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
      ],
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
  const content = data.message?.content || '';

  chatHistory.push({ role: 'assistant', content });

  // Parse: extract DSL JSON from code blocks, rest is explanation text
  const dsl = extractDSL(content);
  const toolCalls = [];

  if (dsl) {
    // Determine if it's a create or modify based on structure
    if (Array.isArray(dsl)) {
      // It's a blocks array for create_program
      toolCalls.push({ name: 'create_program', args: { blocks: dsl } });
    } else if (dsl.blocks) {
      toolCalls.push({ name: 'create_program', args: { blocks: dsl.blocks } });
    } else if (dsl.operations) {
      toolCalls.push({ name: 'modify_program', args: { operations: dsl.operations } });
    }
  }

  // Strip the JSON code block from the text explanation
  const explanation = content.replace(/```json\s*\n?[\s\S]*?```/g, '').trim();

  return { text: explanation, toolCalls };
}
