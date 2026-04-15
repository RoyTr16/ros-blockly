import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import * as geminiBackend from '../../ai/gemini';
import * as ollamaBackend from '../../ai/ollama';
import { compileDSL } from '../../ai/dslCompiler';
import { decompileDSL } from '../../ai/dslDecompiler';
import './AiChat.css';

const API_KEY_STORAGE = 'gemini_api_key';
const BACKEND_STORAGE = 'ai_backend';
const OLLAMA_URL_STORAGE = 'ollama_url';
const OLLAMA_MODEL_STORAGE = 'ollama_model';

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5-coder:7b';

const AiChat = ({ blocklyRef, generatedCode, onPreviewChange }) => {

  // Decompile the current workspace back to DSL format for AI context
  const getWorkspaceDSL = () => {
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) return null;
    try {
      const json = Blockly.serialization.workspaces.save(ws);
      if (!json?.blocks?.blocks?.length) return null;
      const dsl = decompileDSL(json);
      return dsl.length > 0 ? JSON.stringify(dsl, null, 2) : null;
    } catch { return null; }
  };
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_STORAGE) || 'gemini');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || ENV_KEY);
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem(OLLAMA_URL_STORAGE) || DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem(OLLAMA_MODEL_STORAGE) || DEFAULT_OLLAMA_MODEL);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [keySet, setKeySet] = useState(() => {
    const savedBackend = localStorage.getItem(BACKEND_STORAGE) || 'gemini';
    if (savedBackend === 'ollama') {
      const url = localStorage.getItem(OLLAMA_URL_STORAGE) || DEFAULT_OLLAMA_URL;
      const model = localStorage.getItem(OLLAMA_MODEL_STORAGE) || DEFAULT_OLLAMA_MODEL;
      ollamaBackend.initOllama(url, model);
      return true;
    }
    const saved = localStorage.getItem(API_KEY_STORAGE) || ENV_KEY;
    if (saved) {
      geminiBackend.initGemini(saved);
      return true;
    }
    return false;
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingJson, setPendingJson] = useState(null);
  const [previewActive, setPreviewActive] = useState(false);
  const savedStateRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [thinking, setThinking] = useState(geminiBackend.getThinkingLevel());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Fetch Ollama models when URL changes and backend is ollama
  useEffect(() => {
    if (backend === 'ollama' && ollamaUrl) {
      ollamaBackend.listModels().then(setOllamaModels).catch(() => setOllamaModels([]));
    }
  }, [backend, ollamaUrl]);

  const currentBackend = () => backend === 'ollama' ? ollamaBackend : geminiBackend;

  const handleSetKey = () => {
    if (backend === 'ollama') {
      const url = ollamaUrl.trim() || DEFAULT_OLLAMA_URL;
      localStorage.setItem(OLLAMA_URL_STORAGE, url);
      localStorage.setItem(OLLAMA_MODEL_STORAGE, ollamaModel);
      localStorage.setItem(BACKEND_STORAGE, 'ollama');
      ollamaBackend.initOllama(url, ollamaModel);
      setKeySet(true);
      setMessages([{ role: 'assistant', text: `Connected to Ollama (${ollamaModel}). Describe what you want to build.` }]);
      return;
    }
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    localStorage.setItem(BACKEND_STORAGE, 'gemini');
    geminiBackend.initGemini(trimmed);
    setKeySet(true);
    setMessages([{ role: 'assistant', text: 'Ready! Describe what you want to build.' }]);
  };

  const handleToggleThinking = () => {
    const next = thinking === 'off' ? 'on' : 'off';
    setThinking(next);
    geminiBackend.setThinkingLevel(next);
  };

  const handleClear = () => {
    currentBackend().resetChat();
    setMessages([{ role: 'assistant', text: 'Chat cleared. Describe what you want to build.' }]);
  };

  const handleChangeKey = () => {
    currentBackend().resetChat();
    setMessages([]);
    setKeySet(false);
  };

  // Try to load JSON into workspace to test validity, then restore previous state
  const testLoad = (json) => {
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) return 'No workspace available';
    const savedState = Blockly.serialization.workspaces.save(ws);
    try {
      Blockly.serialization.workspaces.load(json, ws);
      return null; // success
    } catch (err) {
      return err.message;
    } finally {
      try { Blockly.serialization.workspaces.load(savedState, ws); } catch (e) { /* best effort */ }
    }
  };

  // Apply modify_program operations to the current workspace JSON
  const applyModifications = (operations) => {
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) return { error: 'No workspace available' };
    const json = Blockly.serialization.workspaces.save(ws);
    if (!json?.blocks?.blocks?.length) return { error: 'Workspace is empty — nothing to modify.' };

    const modified = JSON.parse(JSON.stringify(json)); // deep clone

    for (const op of operations) {
      let found = false;
      let occurrence = op.occurrence ?? 0;
      let count = 0;

      const walk = (block) => {
        if (!block || found) return;
        if (block.type === op.block_type) {
          if (count === occurrence) {
            if (op.action === 'set_field') {
              block.fields = block.fields || {};
              block.fields[op.field] = op.value;
              found = true;
            } else if (op.action === 'set_input') {
              block.inputs = block.inputs || {};
              block.inputs[op.input] = { block: { type: 'math_number', id: 'm' + Date.now(), fields: { NUM: Number(op.value) } } };
              found = true;
            } else if (op.action === 'remove_block') {
              block._remove = true;
              found = true;
            }
          }
          count++;
        }
        if (block.next?.block) walk(block.next.block);
        if (block.inputs) {
          for (const inp of Object.values(block.inputs)) {
            if (inp.block) walk(inp.block);
          }
        }
      };

      modified.blocks.blocks.forEach(walk);
      if (!found) return { error: `Could not find block "${op.block_type}" (occurrence ${occurrence}).` };
    }

    return { json: modified, error: null };
  };

  // Show preview: save current workspace, load new JSON, activate overlay
  const showPreview = (json) => {
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) return;
    savedStateRef.current = Blockly.serialization.workspaces.save(ws);
    try {
      Blockly.serialization.workspaces.load(json, ws);
      setPreviewActive(true);
      onPreviewChange?.(true);
    } catch (err) {
      // Restore if preview load fails
      try { Blockly.serialization.workspaces.load(savedStateRef.current, ws); } catch (e) { /* best effort */ }
      savedStateRef.current = null;
    }
  };

  const handleApply = () => {
    if (!pendingJson) return;
    // Blocks are already loaded as preview — just confirm
    savedStateRef.current = null;
    setPendingJson(null);
    setPreviewActive(false);
    onPreviewChange?.(false);
    setMessages(prev => prev.map(m =>
      m.role === 'pending' ? { ...m, role: 'success', text: 'Program loaded into workspace!' } : m
    ));
  };

  const handleReject = () => {
    // Restore the saved workspace state
    if (savedStateRef.current) {
      const ws = blocklyRef?.current?.getWorkspace?.();
      if (ws) {
        try { Blockly.serialization.workspaces.load(savedStateRef.current, ws); } catch (e) { /* best effort */ }
      }
      savedStateRef.current = null;
    }
    setPendingJson(null);
    setPreviewActive(false);
    onPreviewChange?.(false);
    setMessages(prev => prev.map(m =>
      m.role === 'pending' ? { ...m, role: 'assistant', text: 'Program dismissed. Feel free to ask for changes or a new program.' } : m
    ));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    // Dismiss any active preview before processing new request
    if (previewActive && savedStateRef.current) {
      const ws = blocklyRef?.current?.getWorkspace?.();
      if (ws) {
        try { Blockly.serialization.workspaces.load(savedStateRef.current, ws); } catch (e) { /* best effort */ }
      }
      savedStateRef.current = null;
      setPreviewActive(false);
      onPreviewChange?.(false);
    }
    setPendingJson(null);

    try {
      const dslContext = getWorkspaceDSL();
      const { text: responseText, toolCalls } = await currentBackend().sendMessage(text, dslContext);

      // Show text response if any
      if (responseText) {
        setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
      }

      // Process tool calls
      const createCall = toolCalls.find(tc => tc.name === 'create_program');
      const modifyCall = toolCalls.find(tc => tc.name === 'modify_program');

      // If there's a tool call but no explanation text, add a default
      if ((createCall || modifyCall) && !responseText.trim()) {
        setMessages(prev => [...prev, { role: 'assistant', text: createCall ? 'Here\'s the program I created for you:' : 'I\'ve applied the requested changes:' }]);
      }

      if (createCall) {
        // blocks comes as a JSON string from the tool call — parse it
        let blocksData;
        try {
          blocksData = typeof createCall.args.blocks === 'string'
            ? JSON.parse(createCall.args.blocks)
            : createCall.args.blocks;
        } catch (e) {
          setMessages(prev => [...prev, { role: 'error', text: `Failed to parse program data: ${e.message}` }]);
          return;
        }
        console.log('create_program DSL:', JSON.stringify(blocksData, null, 2));
        const json = compileDSL({ blocks: blocksData });
        const loadErr = testLoad(json);
        if (loadErr) {
          setMessages(prev => [...prev, { role: 'error', text: `Block load error: ${loadErr}` }]);
        } else {
          setPendingJson(json);
          showPreview(json);
          setMessages(prev => [...prev, { role: 'pending', text: 'Program ready. Preview shown in workspace.' }]);
        }
      } else if (modifyCall) {
        let operations;
        try {
          operations = typeof modifyCall.args.operations === 'string'
            ? JSON.parse(modifyCall.args.operations)
            : modifyCall.args.operations;
        } catch (e) {
          setMessages(prev => [...prev, { role: 'error', text: `Failed to parse modifications: ${e.message}` }]);
          return;
        }
        console.log('modify_program ops:', JSON.stringify(operations, null, 2));
        const result = applyModifications(operations || []);
        if (result.error) {
          setMessages(prev => [...prev, { role: 'error', text: result.error }]);
        } else {
          const loadErr = testLoad(result.json);
          if (loadErr) {
            setMessages(prev => [...prev, { role: 'error', text: `Modification error: ${loadErr}` }]);
          } else {
            setPendingJson(result.json);
            showPreview(result.json);
            setMessages(prev => [...prev, { role: 'pending', text: 'Modifications ready. Preview shown in workspace.' }]);
          }
        }
      } else if (!responseText) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'I received your message but had no response. Please try again.' }]);
      }
    } catch (err) {
      console.error('AI Chat error:', err);
      let errorMsg = err.message || 'Unknown error';
      if (errorMsg.length > 300) errorMsg = errorMsg.substring(0, 300) + '...';
      setMessages(prev => [...prev, { role: 'error', text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!keySet) {
    return (
      <div className="ai-chat">
        <div className="ai-chat-key-setup">
          <div className="ai-chat-backend-tabs">
            <button className={`ai-chat-backend-tab ${backend === 'gemini' ? 'active' : ''}`} onClick={() => setBackend('gemini')}>Gemini</button>
            <button className={`ai-chat-backend-tab ${backend === 'ollama' ? 'active' : ''}`} onClick={() => setBackend('ollama')}>Ollama</button>
          </div>
          {backend === 'gemini' ? (
            <>
              <label>
                Enter your <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> API key.
              </label>
              <div className="ai-chat-key-row">
                <input
                  className="ai-chat-key-input"
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetKey()}
                />
                <button className="ai-chat-key-btn" onClick={handleSetKey}>Save</button>
              </div>
            </>
          ) : (
            <>
              <label>
                Connect to a local <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a> instance.
              </label>
              <div className="ai-chat-key-row">
                <input
                  className="ai-chat-key-input"
                  type="text"
                  placeholder="http://localhost:11434"
                  value={ollamaUrl}
                  onChange={e => setOllamaUrl(e.target.value)}
                />
              </div>
              <div className="ai-chat-key-row">
                <input
                  className="ai-chat-key-input"
                  type="text"
                  placeholder="Model name (e.g. llama3.1)"
                  value={ollamaModel}
                  onChange={e => setOllamaModel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetKey()}
                  list="ollama-models"
                />
                <datalist id="ollama-models">
                  {ollamaModels.map(m => <option key={m} value={m} />)}
                </datalist>
                <button className="ai-chat-key-btn" onClick={handleSetKey}>Connect</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
          {backend === 'gemini' && (
            <button
              className={`ai-chat-clear ai-chat-thinking-toggle ${thinking === 'on' ? 'active' : ''}`}
              onClick={handleToggleThinking}
              title={thinking === 'on' ? 'Thinking: ON (better quality, more tokens)' : 'Thinking: OFF (faster, fewer tokens)'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
              {thinking === 'on' ? 'Think' : 'Fast'}
            </button>
          )}
          <button className="ai-chat-clear" onClick={handleChangeKey}>
            {backend === 'gemini' ? 'Key' : ollamaModel}
          </button>
          <button className="ai-chat-clear" onClick={handleClear}>Clear</button>
      </div>

      <div className="ai-chat-messages">
        {messages.length === 0 && !loading && (
          <div className="ai-chat-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
              <line x1="10" y1="22" x2="14" y2="22"/>
            </svg>
            <span className="ai-chat-empty-text">Describe what you want to build</span>
            <span className="ai-chat-empty-hint">e.g. "Blink the LED on pin 13 every second"</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ${msg.role}`}>
            {msg.text}
            {msg.role === 'pending' && pendingJson && (
              <div className="ai-chat-btn-row">
                <button className="ai-chat-apply-btn" onClick={handleApply}>
                  Apply to Workspace
                </button>
                <button className="ai-chat-reject-btn" onClick={handleReject}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="ai-chat-loading">
            Thinking
            <span className="ai-chat-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input-area">
        <textarea
          className="ai-chat-input"
          placeholder="Describe your program..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button
          className="ai-chat-send"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          title="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  );
};

export default AiChat;
