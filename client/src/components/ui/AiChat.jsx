import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import { initGemini, isInitialized, sendMessage, extractBlocklyJson, resetChat } from '../../ai/gemini';
import './AiChat.css';

const API_KEY_STORAGE = 'gemini_api_key';

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const AiChat = ({ blocklyRef }) => {
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
  const messagesEndRef = useRef(null);

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

  // Validate all block types in a workspace JSON exist in Blockly
  const findInvalidBlocks = (json) => {
    const invalid = new Set();
    const check = (obj) => {
      if (!obj) return;
      if (obj.type && !Blockly.Blocks[obj.type]) invalid.add(obj.type);
      if (obj.next?.block) check(obj.next.block);
      if (obj.inputs) {
        for (const inp of Object.values(obj.inputs)) {
          if (inp.block) check(inp.block);
        }
      }
    };
    if (json?.blocks?.blocks) json.blocks.blocks.forEach(check);
    return [...invalid];
  };

  const tryLoadJson = (json) => {
    const invalid = findInvalidBlocks(json);
    if (invalid.length > 0) throw new Error(`These block types don't exist: ${invalid.join(', ')}`);
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) throw new Error('No workspace available');
    Blockly.serialization.workspaces.load(json, ws);
  };

  const handleApply = () => {
    if (!pendingJson) return;
    try {
      tryLoadJson(pendingJson);
      setPendingJson(null);
      setMessages(prev => prev.map(m =>
        m.role === 'pending' ? { ...m, role: 'success', text: 'Program loaded into workspace!' } : m
      ));
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: err.message }]);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    setPendingJson(null);

    try {
      // Get current workspace state for context
      let currentState = null;
      const ws = blocklyRef?.current?.getWorkspace?.();
      if (ws) {
        const allBlocks = ws.getAllBlocks(false);
        if (allBlocks.length > 0) {
          currentState = Blockly.serialization.workspaces.save(ws);
        }
      }

      let responseText = await sendMessage(text, currentState);
      let extracted = extractBlocklyJson(responseText);

      if (!extracted) {
        // Pure conversation — no code block in response
        setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
      } else if (extracted.parseError || !extracted.json) {
        // LLM sent a code block but JSON was invalid — ask to fix
        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }
        const fixMsg = `Your JSON had a parse error: "${extracted.parseError}". Please fix and resend only the corrected JSON.`;
        responseText = await sendMessage(fixMsg, null);
        extracted = extractBlocklyJson(responseText);
        if (!extracted || !extracted.json) {
          throw new Error('Failed to get valid JSON from AI');
        }
        // Validate block types before showing Apply
        const invalid = findInvalidBlocks(extracted.json);
        if (invalid.length > 0) {
          throw new Error(`AI used invalid block types: ${invalid.join(', ')}`);
        }
        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }
        setPendingJson(extracted.json);
        setMessages(prev => [...prev, { role: 'pending', text: 'Program ready.' }]);
      } else {
        // Valid JSON — validate block types
        let json = extracted.json;
        const invalid = findInvalidBlocks(json);
        if (invalid.length > 0) {
          // Retry once
          const fixMsg = `Error: these block types don't exist: ${invalid.join(', ')}. Use only valid blocks. Fix and resend.`;
          responseText = await sendMessage(fixMsg, null);
          extracted = extractBlocklyJson(responseText);
          if (!extracted || !extracted.json) throw new Error('LLM did not return corrected JSON');
          const invalid2 = findInvalidBlocks(extracted.json);
          if (invalid2.length > 0) throw new Error(`AI used invalid block types: ${invalid2.join(', ')}`);
          json = extracted.json;
        }

        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }
        setPendingJson(json);
        setMessages(prev => [...prev, { role: 'pending', text: 'Program ready.' }]);
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
          <button className="ai-chat-clear" onClick={handleChangeKey}>Key</button>
          <button className="ai-chat-clear" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <div className="ai-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ${msg.role}`}>
            {msg.text}
            {msg.role === 'pending' && pendingJson && (
              <button className="ai-chat-apply-btn" onClick={handleApply}>
                Apply to Workspace
              </button>
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
