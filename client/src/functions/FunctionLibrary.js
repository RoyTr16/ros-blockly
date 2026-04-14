// FunctionLibrary: save, load, and manage reusable function definitions
// Functions are stored in localStorage as serialized Blockly block JSON.

import * as Blockly from 'blockly/core';

const STORAGE_KEY = 'blockly_function_library';

export function getSavedFunctions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFunctionList(funcs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(funcs));
}

// Extract a procedure definition block's serialized state
export function serializeFunctionBlock(workspace, blockId) {
  const block = workspace.getBlockById(blockId);
  if (!block) return null;

  const type = block.type;
  if (type !== 'procedures_defnoreturn' && type !== 'procedures_defreturn') return null;

  // Serialize just this block and its children
  const state = Blockly.serialization.blocks.save(block);
  const name = block.getFieldValue('NAME') || 'untitled';
  const params = block.getVars ? block.getVars() : [];

  return {
    name,
    params,
    hasReturn: type === 'procedures_defreturn',
    blockState: state,
    savedAt: new Date().toISOString(),
  };
}

// Save a function to the library
export function saveFunction(workspace, blockId) {
  const func = serializeFunctionBlock(workspace, blockId);
  if (!func) return null;

  const funcs = getSavedFunctions();

  // Replace if same name exists
  const idx = funcs.findIndex(f => f.name === func.name);
  if (idx >= 0) {
    funcs[idx] = func;
  } else {
    funcs.push(func);
  }

  saveFunctionList(funcs);
  return func;
}

// Delete a function from the library
export function deleteFunction(name) {
  const funcs = getSavedFunctions().filter(f => f.name !== name);
  saveFunctionList(funcs);
}

// Load a function definition into the workspace
export function loadFunction(workspace, func) {
  if (!workspace || !func?.blockState) return;
  Blockly.serialization.blocks.append(func.blockState, workspace);
}

// Export a function as a downloadable .func.json file
export function exportFunction(workspace, blockId) {
  const func = serializeFunctionBlock(workspace, blockId);
  if (!func) return;

  const blob = new Blob([JSON.stringify(func, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${func.name}.func.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import a .func.json file into the library and workspace
export function importFunctionFile(workspace) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.func.json,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const func = JSON.parse(ev.target.result);
          if (!func.blockState || !func.name) {
            alert('Invalid function file');
            resolve(null);
            return;
          }
          // Add to library
          const funcs = getSavedFunctions();
          const idx = funcs.findIndex(f => f.name === func.name);
          if (idx >= 0) funcs[idx] = func;
          else funcs.push(func);
          saveFunctionList(funcs);

          // Load into workspace
          loadFunction(workspace, func);
          resolve(func);
        } catch (err) {
          alert('Failed to import: ' + err.message);
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
