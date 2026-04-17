# Async Execution & Sequential Control

This document explains the **Asynchronous Execution Engine** implemented to support sequential logic (e.g., "Move, then Wait, then Move") and cancellable programs in the Blockly interface.

## 1. The Problem: Synchronous Execution
By default, Blockly generators produce a string of JavaScript code. If we used a standard `eval` or `new Function`, code like this:
```javascript
ros.publish(twist1);
ros.publish(twist2);
```
would execute both publish commands **instantly** (within the same millisecond). This makes it impossible to create sequences like "Drive Forward for 2 seconds, then Stop".

## 2. The Solution: Async/Await Wrapper

### Execution Engine (`client/src/hooks/useRobotControl.js`)
The generated code is wrapped in an Immediately Invoked Async Function Expression (IIAFE) and executed via `new Function()`:

```javascript
const runBlocklyCode = new Function('ros', 'ROSLIB', 'log', 'wait', `
  return (async () => {
    try {
      ${generatedCode}
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      log('Error: ' + err.message);
    }
  })();
`);
runBlocklyCode(ros, ROSLIB, addLog, wait);
```

### The `wait` Function
A cancellable wait is injected into the execution scope. It checks an `AbortController` signal so that running programs can be stopped mid-execution:

```javascript
const abortController = new AbortController();
const signal = abortController.signal;

const wait = (seconds) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
  const timer = setTimeout(resolve, seconds * 1000);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});
```

When the user clicks **Stop**, `abortController.abort()` is called. Any pending `await wait(...)` immediately rejects with an `AbortError`, and the catch block silently returns.

## 3. Concurrent Execution (Multiple Block Groups)

When the Blockly workspace contains **multiple disconnected stacks** of blocks, they run concurrently via `Promise.all`:

```javascript
// Preamble: shared variable declarations and function definitions
${preamble}

async function __group0__() { /* first stack */ }
async function __group1__() { /* second stack */ }

await Promise.all([__group0__(), __group1__()]);
```

The **preamble** (variable declarations and function definitions extracted from `javascriptGenerator.definitions_`) is placed before all groups so every group shares the same variables and functions.

If there is only a single block group, the full generated code runs sequentially without `Promise.all`.

## 4. Block Implementation

### The Wait Block
**File**: `client/src/blocks/utilities/utilities.js`
```javascript
// Generator
return `await wait(${seconds});\n`;
```

### Package-Defined Blocks (JSON Templates)
Robot-specific blocks are defined in JSON packages (see `block_implementation_strategy.md`). Their generator templates produce code that executes directly in the async scope:
```json
{
  "template": "{\n  var topic = new ROSLIB.Topic(...);\n  topic.publish(msg);\n}\n"
}
```

## 5. Writing New Blocks
When creating new blocks, follow these rules:

1.  **Do NOT use IIFEs**:
    *   *Bad*: `(function() { topic.publish(...) })();` → Creates a separate scope that the main `async` wrapper cannot await.
    *   *Good*: `{ topic.publish(...); }` → Bare block for scoping, stays in the main async scope.

2.  **Use `await wait(...)` for Delays**:
    *   If your block initiates an action that takes time, add `await wait(time)` at the end.
    *   The `wait` function respects the abort signal, so the program can be stopped cleanly.

3.  **Global Objects**:
    *   `ros`, `ROSLIB`, `log`, and `wait` are available globally in the execution scope.
    *   `window.rosBlockly` provides runtime state (start time, graph data, sensor subscriptions).

4.  **AbortError Handling**:
    *   The top-level catch block in the execution engine silently ignores `AbortError`. You do not need to handle it in individual blocks.
