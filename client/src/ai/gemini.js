// Gemini API wrapper for Blockly code generation
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildSystemPrompt } from './promptBuilder';

let chatSession = null;
let genAI = null;

export function initGemini(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  chatSession = null; // reset on key change
}

export function isInitialized() {
  return genAI !== null;
}

function getOrCreateChat() {
  if (chatSession) return chatSession;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });
  chatSession = model.startChat({
    history: [],
  });
  return chatSession;
}

export function resetChat() {
  chatSession = null;
}

// Sends a user message (optionally with current workspace context) and returns the raw response text
export async function sendMessage(userMessage, currentWorkspaceJson = null) {
  if (!genAI) throw new Error('Gemini not initialized. Please set your API key.');

  const chat = getOrCreateChat();

  let fullMessage = userMessage;
  if (currentWorkspaceJson) {
    fullMessage += `\n\nCurrent workspace state:\n\`\`\`json\n${JSON.stringify(currentWorkspaceJson, null, 2)}\n\`\`\``;
  }

  // Retry once on 429 rate limit
  let result;
  try {
    result = await chat.sendMessage(fullMessage);
  } catch (err) {
    if (err.message && err.message.includes('429')) {
      await new Promise(r => setTimeout(r, 3000));
      result = await chat.sendMessage(fullMessage);
    } else {
      throw err;
    }
  }
  return result.response.text();
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
