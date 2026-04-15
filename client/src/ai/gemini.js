// Gemini API wrapper with function calling for DSL-based block generation
import { buildSystemPrompt } from './promptBuilder';
import { buildToolDeclarations } from './toolDefinitions';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3-flash-preview';

let apiKey = null;
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

  const url = `${API_BASE}/${MODEL}:generateContent?key=${apiKey}`;
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
    fullMessage += `\n\nCurrent program (generated JavaScript):\n\`\`\`javascript\n${currentWorkspaceCode}\n\`\`\``;
  }

  chatHistory.push({ role: 'user', parts: [{ text: fullMessage }] });

  const { parts, rawContent } = await callApi(chatHistory);

  // Add model response to history (include function call parts for context)
  chatHistory.push({ role: 'model', parts: rawContent.parts });

  return parseResponse(parts);
}
