import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import { initGemini, isInitialized, sendMessage, resetChat, setThinkingLevel, getThinkingLevel } from '../../ai/gemini';
import { compileDSL } from '../../ai/dslCompiler';
import './AiChat.css';

const API_KEY_STORAGE = 'gemini_api_key';

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const AiChat = ({ blocklyRef, generatedCode, onPreviewChange }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || ENV_KEY);
  const [keySet, setKeySet] = useState(() => {
    const saved = localStorage.getItem(API_KEY_STORAGE) || ENV_KEY;
    if (saved) {
      initGemini(saved);
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

  const [thinking, setThinking] = useState(getThinkingLevel());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSetKey = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    initGemini(trimmed);
    setKeySet(true);
    setMessages([{ role: 'assistant', text: 'Ready! Describe what you want to build.' }]);
  };

  const handleToggleThinking = () => {
    const next = thinking === 'off' ? 'on' : 'off';
    setThinking(next);
    setThinkingLevel(next);
  };

  const handleClear = () => {
    resetChat();
    setMessages([{ role: 'assistant', text: 'Chat cleared. Describe what you want to build.' }]);
  };

  const handleChangeKey = () => {
    resetChat();
    setMessages([]);
    setKeySet(false);
    setApiKey('');
    localStorage.removeItem(API_KEY_STORAGE);
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
      const currentCode = generatedCode?.trim() || null;
      const { text: responseText, toolCalls } = await sendMessage(text, currentCode);

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
        <div className="ai-chat-header">
          <span className="ai-chat-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
            AI Assistant
          </span>
        </div>
        <div className="ai-chat-key-setup">
          <label>
            Enter your <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> API key to enable the AI assistant.
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
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
        <span className="ai-chat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
          AI Assistant
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className={`ai-chat-clear ai-chat-thinking-toggle ${thinking === 'on' ? 'active' : ''}`}
            onClick={handleToggleThinking}
            title={thinking === 'on' ? 'Thinking: ON (better quality, more tokens)' : 'Thinking: OFF (faster, fewer tokens)'}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
            {thinking === 'on' ? 'Think' : 'Fast'}
          </button>
          <button className="ai-chat-clear" onClick={handleChangeKey}>Key</button>
          <button className="ai-chat-clear" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <div className="ai-chat-messages">
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
