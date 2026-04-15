// Gemini API wrapper with function calling for DSL-based block generation
import { buildSystemPrompt, getBlockDetails } from './promptBuilder';
import { buildToolDeclarations } from './toolDefinitions';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview', label: 'Flash' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Lite' },
];
const DEFAULT_MODEL = GEMINI_MODELS[0].id;

let apiKey = null;
let model = DEFAULT_MODEL;
let chatHistory = []; // { role: 'user'|'model', parts: [...] }
let thinkingLevel = 'off'; // 'off' | 'on'

export function initGemini(key) {
  apiKey = key;
  chatHistory = [];
}

export function isInitialized() {
  return apiKey !== null;
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

export function getModels() {
  return GEMINI_MODELS;
}

export function setThinkingLevel(level) {
  thinkingLevel = level;
  chatHistory = [];
}

export function getThinkingLevel() {
  return thinkingLevel;
}

async function callApi(contents, retries = 1) {
  const tools = [{ functionDeclarations: buildToolDeclarations() }];

  const body = {
    contents,
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    tools,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 65536,
      thinkingConfig: {
        thinkingLevel: thinkingLevel === 'on' ? 'HIGH' : 'MINIMAL',
      },
    },
  };

  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && retries > 0) {
    await new Promise(r => setTimeout(r, 3000));
    return callApi(contents, retries - 1);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts) throw new Error('No response from model');

  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Response was truncated — the program may be too complex. Try requesting a simpler version.');
  }

  return { parts, rawContent: candidate.content };
}

// Parse the response parts into a structured result
function parseResponse(parts) {
  const result = { text: '', toolCalls: [] };

  for (const part of parts) {
    if (part.thought) continue; // skip thinking
    if (part.text) result.text += part.text;
    if (part.functionCall) {
      result.toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
      });
    }
  }

  return result;
}

// Send a message and get back { text, toolCalls }
export async function sendMessage(userMessage, currentWorkspaceCode = null, _opts = {}) {
  if (!apiKey) throw new Error('Gemini not initialized. Please set your API key.');

  let fullMessage = userMessage;
  if (currentWorkspaceCode) {
    fullMessage += `\n\nCurrent program (DSL format):\n${currentWorkspaceCode}`;
  }

  chatHistory.push({ role: 'user', parts: [{ text: fullMessage }] });

  const { parts, rawContent } = await callApi(chatHistory);
  chatHistory.push({ role: 'model', parts: rawContent.parts });

  // Handle get_block_details tool call — resolve it automatically and re-call
  const result = parseResponse(parts);
  const detailsCall = result.toolCalls.find(tc => tc.name === 'get_block_details');

  if (detailsCall) {
    let blockTypes;
    try {
      blockTypes = typeof detailsCall.args.block_types === 'string'
        ? JSON.parse(detailsCall.args.block_types)
        : detailsCall.args.block_types;
    } catch {
      blockTypes = [];
    }

    const details = getBlockDetails(blockTypes);
    console.log('[Gemini] get_block_details for:', blockTypes);

    // Send the tool response back to the model
    chatHistory.push({
      role: 'user',
      parts: [{
        functionResponse: {
          name: 'get_block_details',
          response: { result: details || 'No matching blocks found.' },
        },
      }],
    });

    const { parts: parts2, rawContent: raw2 } = await callApi(chatHistory);
    chatHistory.push({ role: 'model', parts: raw2.parts });

    const result2 = parseResponse(parts2);
    // Merge text from both phases
    result2.text = (result.text + '\n\n' + result2.text).trim();
    // Filter out get_block_details from final tool calls
    result2.toolCalls = result2.toolCalls.filter(tc => tc.name !== 'get_block_details');
    return result2;
  }

  // Filter out get_block_details from final result (shouldn't happen, but safety)
  result.toolCalls = result.toolCalls.filter(tc => tc.name !== 'get_block_details');
  return result;
}
