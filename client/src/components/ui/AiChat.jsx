import React, { useState, useRef, useEffect } from 'react';
import * as Blockly from 'blockly/core';
import { initGemini, isInitialized, sendMessage, extractBlocklyJson, resetChat } from '../../ai/gemini';
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

  // Detect blocks with missing required value inputs
  const findMissingInputs = (json) => {
    const issues = [];
    // Map of block types to their required value inputs
    const requiredInputs = {
      controls_repeat_ext: ['TIMES'],
      controls_for: ['FROM', 'TO', 'BY'],
      controls_whileUntil: ['BOOL'],
      logic_compare: ['A', 'B'],
      logic_operation: ['A', 'B'],
      math_arithmetic: ['A', 'B'],
      variables_set: ['VALUE'],
    };
    const walk = (block) => {
      if (!block) return;
      const req = requiredInputs[block.type];
      if (req) {
        const missing = req.filter(inp => !block.inputs?.[inp]?.block && !block.inputs?.[inp]?.shadow);
        if (missing.length > 0) {
          issues.push(`${block.type} is missing required input(s): ${missing.join(', ')}. Connect a block (e.g. math_number) to each.`);
        }
      }
      if (block.next?.block) walk(block.next.block);
      if (block.inputs) {
        for (const inp of Object.values(block.inputs)) {
          if (inp.block) walk(inp.block);
        }
      }
    };
    if (json?.blocks?.blocks) json.blocks.blocks.forEach(walk);
    return [...new Set(issues)];
  };

  // Detect variable misuse: single-letter names, action blocks using different vars than setup blocks
  const findVariableIssues = (json) => {
    const issues = [];
    if (!json?.blocks?.blocks || !json?.variables) return issues;

    // Check 1: Single-letter variable names
    const singleLetterVars = json.variables.filter(v => /^[a-zA-Z]$/.test(v.name));
    if (singleLetterVars.length > 0) {
      issues.push(`Variables have single-letter names (${singleLetterVars.map(v => `"${v.name}"`).join(', ')}). Use descriptive names like "led1", "sensor1".`);
    }

    // Collect all blocks that have a VAR field
    const varBlocks = [];
    const walk = (block) => {
      if (!block) return;
      if (block.type && block.fields?.VAR) {
        const varRef = block.fields.VAR;
        const varId = typeof varRef === 'object' ? varRef.id : varRef;
        varBlocks.push({ type: block.type, varId });
      }
      if (block.next?.block) walk(block.next.block);
      if (block.inputs) {
        for (const inp of Object.values(block.inputs)) {
          if (inp.block) walk(inp.block);
        }
      }
    };
    json.blocks.blocks.forEach(walk);

    // Check 2: Action blocks using different vars than their setup block
    const setupFamilies = {}; // family prefix -> Set of varIds
    for (const vb of varBlocks) {
      const m = vb.type.match(/^(.+?)_setup/);
      if (m) {
        const family = m[1];
        if (!setupFamilies[family]) setupFamilies[family] = new Set();
        setupFamilies[family].add(vb.varId);
      }
    }
    for (const vb of varBlocks) {
      if (vb.type.includes('_setup')) continue;
      for (const [family, setupVars] of Object.entries(setupFamilies)) {
        if (vb.type.startsWith(family + '_') && !setupVars.has(vb.varId)) {
          const setupNames = [...setupVars].map(id => {
            const v = json.variables.find(v => v.id === id);
            return v ? `"${v.name}"` : id;
          });
          issues.push(`${vb.type} blocks must use the same variable as the setup block (${setupNames.join(' or ')}), not separate variables.`);
          break;
        }
      }
    }

    return [...new Set(issues)];
  };

  // Auto-fix known JSON issues that the LLM consistently gets wrong
  const autoFixJson = (json) => {
    if (!json?.blocks?.blocks) return json;
    const fixed = JSON.parse(JSON.stringify(json)); // deep clone
    const walk = (block) => {
      if (!block) return;
      // Fix controls_if: infer extraState from inputs
      if (block.type === 'controls_if' && block.inputs) {
        let elseIfCount = 0;
        let hasElse = false;
        for (const key of Object.keys(block.inputs)) {
          const m = key.match(/^IF(\d+)$/);
          if (m && parseInt(m[1]) > 0) elseIfCount = Math.max(elseIfCount, parseInt(m[1]));
          if (key === 'ELSE') hasElse = true;
        }
        if (elseIfCount > 0 || hasElse) {
          block.extraState = { elseIfCount, hasElse };
        }
      }
      if (block.next?.block) walk(block.next.block);
      if (block.inputs) {
        for (const inp of Object.values(block.inputs)) {
          if (inp.block) walk(inp.block);
        }
      }
    };
    fixed.blocks.blocks.forEach(walk);
    return fixed;
  };

  // Run all validators and return issues list
  const findAllIssues = (json) => {
    return [
      ...findInvalidBlocks(json).map(b => `Block type "${b}" does not exist. Use only blocks from the catalog.`),
      ...findVariableIssues(json),
      ...findMissingInputs(json),
    ];
  };

  // Build a structured fix message for the LLM based on error type
  const buildFixMessage = (errorMsg) => {
    let instructions = '';
    if (errorMsg.includes('missing a(n) IF')) {
      instructions = '\nFix: controls_if blocks with else-if/else branches MUST have "extraState": {"elseIfCount": N, "hasElse": true/false}. Count the number of else-if branches (IF1, IF2, etc.) to set elseIfCount. Set hasElse to true if there is an ELSE input.';
    } else if (errorMsg.includes('does not exist') || errorMsg.includes('don\'t exist')) {
      instructions = '\nFix: You used a block type that does not exist. Only use block types from the available blocks catalog. Re-check your block type names.';
    } else if (errorMsg.includes('missing') && errorMsg.includes('connection')) {
      instructions = '\nFix: A block is missing a required input connection. Make sure every input that the block expects has a connected block (e.g. math_number for numeric inputs, logic_boolean for boolean inputs).';
    }
    return `Blockly rejected your JSON with this error:\n"${errorMsg}"\n${instructions}\nPlease fix the issue and resend the complete corrected workspace JSON.`;
  };

  // Try to load JSON into workspace to test validity, then restore previous state
  const testLoad = (json) => {
    const ws = blocklyRef?.current?.getWorkspace?.();
    if (!ws) return 'No workspace available';
    // Save current state so we can restore after test
    const savedState = Blockly.serialization.workspaces.save(ws);
    try {
      Blockly.serialization.workspaces.load(json, ws);
      return null; // success
    } catch (err) {
      return err.message;
    } finally {
      // Always restore the original workspace
      try { Blockly.serialization.workspaces.load(savedState, ws); } catch (e) { /* best effort */ }
    }
  };

  // Full validation pipeline: auto-fix, static checks, test load. Returns { json, error }
  const validateJson = (json) => {
    // Step 1: Auto-fix known issues
    const fixed = autoFixJson(json);
    // Step 2: Static analysis
    const issues = findAllIssues(fixed);
    if (issues.length > 0) return { json: fixed, error: issues.join('\n') };
    // Step 3: Test load into actual workspace
    const loadErr = testLoad(fixed);
    if (loadErr) return { json: fixed, error: loadErr };
    return { json: fixed, error: null };
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
      // Get current generated code for context (compact JS instead of bulky JSON)
      const currentCode = generatedCode?.trim() || null;

      let responseText = await sendMessage(text, currentCode);
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
        if (!extracted || !extracted.json) throw new Error('Failed to get valid JSON from AI');
        // Fall through to validation below
        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }
        // Validate + test load with up to 2 retries
        let result = validateJson(extracted.json);
        if (result.error) {
          setMessages(prev => [...prev, { role: 'error', text: `Validation: ${result.error}` }]);
          const fixMsg2 = buildFixMessage(result.error);
          responseText = await sendMessage(fixMsg2, null);
          extracted = extractBlocklyJson(responseText);
          if (!extracted || !extracted.json) throw new Error(`AI responded without code after: ${result.error}`);
          result = validateJson(extracted.json);
          if (result.error) throw new Error(`Validation failed: ${result.error}`);
        }
        setPendingJson(result.json);
        showPreview(result.json);
        setMessages(prev => [...prev, { role: 'pending', text: 'Program ready. Preview shown in workspace.' }]);
      } else {
        // Valid JSON — run full validation pipeline (auto-fix + static checks + test load)
        if (extracted.explanation) {
          setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
        }

        let result = validateJson(extracted.json);

        // Retry up to 2 times on validation errors
        for (let attempt = 0; attempt < 2 && result.error; attempt++) {
          // Show the validation error to the user so they have visibility
          setMessages(prev => [...prev, { role: 'error', text: `Validation: ${result.error}` }]);
          const fixMsg = buildFixMessage(result.error);
          responseText = await sendMessage(fixMsg, null);
          extracted = extractBlocklyJson(responseText);
          if (!extracted || !extracted.json) {
            throw new Error(`AI responded without code after: ${result.error}`);
          }
          if (extracted.explanation) {
            setMessages(prev => [...prev, { role: 'assistant', text: extracted.explanation }]);
          }
          result = validateJson(extracted.json);
        }

        if (result.error) throw new Error(`Validation failed: ${result.error}`);
        setPendingJson(result.json);
        showPreview(result.json);
        setMessages(prev => [...prev, { role: 'pending', text: 'Program ready. Preview shown in workspace.' }]);
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
