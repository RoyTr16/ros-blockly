# Async Execution & Sequential Control

This document explains the **Asynchronous Execution Engine** implemented to support sequential logic (e.g., "Move, then Wait, then Move") in the Blockly interface.

## 1. The Problem: Synchronous Execution
By default, Blockly generators produce a string of JavaScript code. If we used a standard `eval` or `new Function`, code like this:
```javascript
ros.publish(twist1);
ros.publish(twist2);
```
would execute both publish commands **instantly** (within the same millisecond). This makes it impossible to create sequences like "Drive Forward for 2 seconds, then Stop".

## 2. The Solution: Async/Await Wrapper
To enable timing and delays, we wrapped the entire execution scope in an `async` function.

### Execution Engine (`useRobotControl.js`)
Instead of directly executing the string, we wrap it in an Immediately Invoked Async Function Expression (IIAFE):

```javascript
const asyncCode = `
  (async () => {
    try {
      ${generatedCode} // User's blocks go here
    } catch (err) {
      console.error(err);
    }
  })();
`;
```

We also inject a **custom `wait` function** into the scope:
```javascript
const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));
```

### 3. Block Implementation
Blocks that need to block execution (like `wait_seconds` or a trajectory move) generate code using `await`.

#### The Wait Block
**File**: `client/src/blocks/common/wait.js`
```javascript
// Generator
return `await wait(${seconds});\n`;
```

#### The Trajectory Block
**File**: `client/src/blocks/ur5/joint_control.js`
This block sends a command *and* waits for the duration of the movement before yielding control to the next block.
```javascript
topic.publish(msg);
await wait(duration); // Blocks here until movement "finishes"
```

## 4. Writing New Blocks
When creating new blocks, follow these rules:

1.  **Do NOT use IIFEs**:
    *   *Bad*: `(function() { topic.publish(...) })();` -> This creates a separate scope that the main `async` wrapper cannot await.
    *   *Good*: `topic.publish(...);` -> Executes directly in the main async scope.

2.  **Use `await` for Delays**:
    *   If your block initiates an action that takes time, consider adding `await wait(time)` at the end.

3.  **Global Objects**:
    *   `ros`, `ROSLIB`, `log`, and `wait` are available globally in the execution scope.
