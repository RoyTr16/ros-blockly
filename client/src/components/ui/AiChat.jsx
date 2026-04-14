import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import { initGemini, isInitialized, sendMessage, extractBlocklyJson, resetChat } from '../../ai/gemini';
import './AiChat.css';

const API_KEY_STORAGE = 'gemini_api_key';

const AiChat = ({ blocklyRef }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [keySet, setKeySet] = useState(() => {
    const saved = localStorage.getItem(API_KEY_STORAGE);
    if (saved) {
      initGemini(saved);
      return true;
    }
    return false;
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

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
      } else {
        // Response contains code — try to load it
        const tryLoad = (json) => {
          const invalid = findInvalidBlocks(json);
          if (invalid.length > 0) {
            throw new Error(`These block types don't exist: ${invalid.join(', ')}`);
          }
          const ws2 = blocklyRef?.current?.getWorkspace?.();
          if (!ws2) throw new Error('No workspace available');
          Blockly.serialization.workspaces.load(json, ws2);
        };

        try {
          tryLoad(extracted.json);
        } catch (loadErr) {
          // Feed the error back to the LLM and retry once
          const fixMsg = `Error loading your JSON into Blockly: "${loadErr.message}". Fix the issue and respond with corrected JSON.`;
          responseText = await sendMessage(fixMsg, null);
          extracted = extractBlocklyJson(responseText);
          if (!extracted) throw new Error('LLM did not return corrected JSON');
          tryLoad(extracted.json);
        }

        // Show explanation + success
        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }
        setMessages(prev => [...prev, { role: 'success', text: 'Program loaded into workspace!' }]);
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
