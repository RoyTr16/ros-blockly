import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import ReactMarkdown from 'react-markdown';
import * as geminiBackend from '../../ai/gemini';
import * as ollamaBackend from '../../ai/ollama';
import { compileDSL } from '../../ai/dslCompiler';
import { decompileDSL } from '../../ai/dslDecompiler';
import './AiChat.css';

const API_KEY_STORAGE = 'gemini_api_key';
const BACKEND_STORAGE = 'ai_backend';
const OLLAMA_URL_STORAGE = 'ollama_url';
const OLLAMA_MODEL_STORAGE = 'ollama_model';
const GEMINI_MODEL_STORAGE = 'gemini_model';

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen3:8b';

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
  const [ctxUsage, setCtxUsage] = useState(null);
  const savedStateRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [geminiModel, setGeminiModel] = useState(() => {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE);
    if (saved) geminiBackend.setModel(saved);
    return geminiBackend.getModel();
  });
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
    setCtxUsage(null);
  };

  const handleChangeKey = () => {
    currentBackend().resetChat();
    setMessages([]);
    setKeySet(false);
    setCtxUsage(null);
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

    // Helper: compile a DSL block into Blockly JSON (reuse dslCompiler)
    const compileSingleBlock = (dslBlock) => {
      try {
        const result = compileDSL({ blocks: [[dslBlock]] });
        return result?.blocks?.blocks?.[0] || null;
      } catch { return null; }
    };

    // Block types that have no previous/next connections — must be placed as standalone top-level
    const STANDALONE_TYPES = new Set(['utilities_graph_viewer']);

    // Track removed blocks so they can be re-inserted without the model providing the full definition
    const removedBlocks = {};

    for (const op of operations) {
      // --- "insert" action: add a block (or standalone block) at chain/position ---
      if (op.action === 'insert' || op.action === 'add_block') {
        let blockDsl = op.block || op.blocks?.[0];
        // If no block definition provided, try to reuse a previously removed block of same type
        if (!blockDsl && op.block_type && removedBlocks[op.block_type]) {
          blockDsl = removedBlocks[op.block_type];
        }
        if (!blockDsl) return { error: 'insert operation missing "block" field.' };
        // If blockDsl came from removedBlocks, it has a pre-compiled Blockly JSON
        const compiled = blockDsl._compiled
          ? JSON.parse(JSON.stringify(blockDsl._compiled))
          : compileSingleBlock(blockDsl);
        if (!compiled) return { error: `Failed to compile block: ${JSON.stringify(blockDsl)}` };

        const blockType = blockDsl._compiled ? blockDsl._compiled.type : blockDsl.type;
        const isStandalone = STANDALONE_TYPES.has(blockType);
        let chainIdx = op.chain ?? -1;

        // If model specified a block_type target instead of chain index, find which chain contains it
        if (chainIdx < 0 && op.block_type) {
          for (let ci = 0; ci < modified.blocks.blocks.length; ci++) {
            let b = modified.blocks.blocks[ci];
            while (b) {
              if (b.type === op.block_type) { chainIdx = ci; break; }
              b = b.next?.block;
            }
            if (chainIdx >= 0) break;
          }
        }
        // Default to first chain if still not found
        if (chainIdx < 0 && !isStandalone && modified.blocks.blocks.length > 0) {
          chainIdx = 0;
        }

        if (isStandalone || chainIdx < 0 || chainIdx >= modified.blocks.blocks.length) {
          // Add as new top-level block (standalone or invalid chain)
          const lastBlock = modified.blocks.blocks[modified.blocks.blocks.length - 1];
          compiled.x = (lastBlock?.x ?? 50) + 350;
          compiled.y = lastBlock?.y ?? 50;
          modified.blocks.blocks.push(compiled);
        } else {
          // Insert into existing chain at position
          const pos = op.position ?? -1;
          const chainRoot = modified.blocks.blocks[chainIdx];
          if (pos <= 0) {
            // Insert before chain root
            compiled.next = { block: chainRoot };
            compiled.x = chainRoot.x;
            compiled.y = chainRoot.y;
            delete chainRoot.x;
            delete chainRoot.y;
            modified.blocks.blocks[chainIdx] = compiled;
          } else {
            // Walk to position and insert
            let current = chainRoot;
            for (let i = 0; i < pos - 1 && current?.next?.block; i++) {
              current = current.next.block;
            }
            const afterBlock = current.next || null;
            compiled.next = afterBlock;
            current.next = { block: compiled };
          }
        }
        continue;
      }

      // --- block_type-based operations ---
      let found = false;
      let occurrence = op.occurrence ?? 0;
      let count = 0;

      const walk = (block, parent, parentKey) => {
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
              // Save a clean copy before removing (for potential re-insert)
              const saved = JSON.parse(JSON.stringify(block));
              delete saved.next; // don't keep the chain tail
              delete saved._remove;
              removedBlocks[block.type] = { _compiled: saved };
              block._remove = true;
              found = true;
            } else if (op.action === 'add_after') {
              // Insert blocks after this one in the chain
              const newBlocks = op.blocks || (op.block ? [op.block] : []);
              if (newBlocks.length > 0) {
                // Compile the DSL blocks into a chain
                const result = compileDSL({ blocks: [newBlocks] });
                const compiledChain = result?.blocks?.blocks?.[0];
                if (compiledChain) {
                  // Find the tail of the compiled chain
                  let tail = compiledChain;
                  while (tail.next?.block) tail = tail.next.block;
                  // Link: compiled chain tail → block's original next
                  tail.next = block.next || null;
                  block.next = { block: compiledChain };
                }
              }
              found = true;
            }
          }
          count++;
        }
        if (block.next?.block) walk(block.next.block, block, 'next');
        if (block.inputs) {
          for (const inp of Object.values(block.inputs)) {
            if (inp.block) walk(inp.block, block, 'input');
          }
        }
      };

      modified.blocks.blocks.forEach(b => walk(b, null, null));
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
      const { text: responseText, toolCalls, contextUsage } = await currentBackend().sendMessage(text, dslContext);

      // Update context usage display
      if (contextUsage) {
        setCtxUsage(contextUsage);
      }

      // Show text response if any
      // Strip JSON code blocks and raw JSON objects from the explanation when tool calls are present
      let displayText = responseText || '';
      if (toolCalls.length > 0 && displayText) {
        // Remove ```json...``` code blocks
        displayText = displayText.replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '').trim();
        // Remove bare JSON objects/arrays that the model may have dumped as text
        displayText = displayText.replace(/\n\{[\s\S]*\}\s*$/g, '').trim();
      }
      if (displayText) {
        setMessages(prev => [...prev, { role: 'assistant', text: displayText }]);
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
      } else if (!displayText && !responseText) {
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
            <>
              <select
                className="ai-chat-model-select"
                value={geminiModel}
                onChange={(e) => {
                  const m = e.target.value;
                  setGeminiModel(m);
                  localStorage.setItem(GEMINI_MODEL_STORAGE, m);
                  geminiBackend.setModel(m);
                }}
                title="Gemini model"
              >
                {geminiBackend.getModels().map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <button
                className={`ai-chat-clear ai-chat-thinking-toggle ${thinking === 'on' ? 'active' : ''}`}
                onClick={handleToggleThinking}
                title={thinking === 'on' ? 'Thinking: ON (better quality, more tokens)' : 'Thinking: OFF (faster, fewer tokens)'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
                {thinking === 'on' ? 'Think' : 'Fast'}
              </button>
            </>
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
            {msg.role === 'assistant' || msg.role === 'error' || msg.role === 'success'
              ? <ReactMarkdown>{msg.text}</ReactMarkdown>
              : msg.text}
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
        {ctxUsage && backend === 'ollama' && (
          <div className="ai-chat-ctx-bar" title={`${ctxUsage.promptTokens} prompt + ${ctxUsage.completionTokens} completion = ${ctxUsage.total} / ${ctxUsage.numCtx} tokens`}>
            <div className="ai-chat-ctx-fill" style={{ width: `${Math.min(ctxUsage.percent, 100)}%`, backgroundColor: ctxUsage.percent > 80 ? '#e74c3c' : ctxUsage.percent > 50 ? '#f39c12' : '#2ecc71' }} />
            <span className="ai-chat-ctx-label">Context: {ctxUsage.percent}%</span>
          </div>
        )}
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
