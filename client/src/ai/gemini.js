// Gemini API wrapper for Blockly code generation (REST API)
import { buildSystemPrompt } from './promptBuilder';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3-flash-preview';

let apiKey = null;
let chatHistory = []; // { role: 'user'|'model', parts: [{ text }] }
let thinkingLevel = 'off'; // 'off' | 'on' (maps to 'minimal' | 'high')

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
  chatHistory = []; // reset chat since thinking mode changes model behavior
}

export function getThinkingLevel() {
  return thinkingLevel;
}

async function callApi(contents, retries = 1) {
  const body = {
    contents,
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
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

  // Detect truncated response
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Response was truncated — the program may be too complex. Try requesting a simpler version.');
  }

  // Filter out thought parts, return only text
  const textParts = parts.filter(p => !p.thought && p.text);
  return textParts.map(p => p.text).join('');
}

// Sends a user message (optionally with current workspace code for context) and returns the raw response text
export async function sendMessage(userMessage, currentWorkspaceCode = null) {
  if (!apiKey) throw new Error('Gemini not initialized. Please set your API key.');

  let fullMessage = userMessage;
  if (currentWorkspaceCode) {
    fullMessage += `\n\nCurrent program (generated JavaScript):\n\`\`\`javascript\n${currentWorkspaceCode}\n\`\`\``;
  }

  // Add user message to history
  chatHistory.push({ role: 'user', parts: [{ text: fullMessage }] });

  const responseText = await callApi(chatHistory);

  // Add model response to history
  chatHistory.push({ role: 'model', parts: [{ text: responseText }] });

  return responseText;
}

// Extract JSON from a response string, returns { json, explanation } or null
export function extractBlocklyJson(text) {
  // Match all ```json ... ``` blocks (greedy within each block)
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (!jsonMatch) return null;

  const jsonStr = jsonMatch[1].trim();
  // Get explanation text (everything outside the code block)
  const explanation = text.replace(/```(?:json)?\s*\n?[\s\S]*?\n?\s*```/, '').trim();

  try {
    const json = JSON.parse(jsonStr);
    return { json, explanation };
  } catch (e) {
    // JSON parse failed — return the raw JSON string so caller can report
    return { json: null, explanation, parseError: e.message, rawJson: jsonStr };
  }
}
