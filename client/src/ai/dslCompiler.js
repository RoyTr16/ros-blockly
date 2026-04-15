// DSL-to-Blockly JSON compiler
// Converts a simple block description array into valid Blockly workspace JSON.
// The LLM writes pseudo-code-like block descriptions; this module handles all
// Blockly serialization details: IDs, variable arrays, next chains, inputs, shadows, extraState.

import { getLoadedPackages } from '../packages/PackageLoader';

let _nextId = 0;
function uid() { return 'b' + (_nextId++); }

// Build a lookup of block definitions from loaded packages
function getBlockDefs() {
  const defs = {};
  const packages = getLoadedPackages();
  for (const entry of Object.values(packages)) {
    for (const block of entry.pkg.blocks) {
      defs[block.type] = block;
    }
  }
  return defs;
}

// Determine which inputs expect a Pin block vs a Number block
function getInputMeta(blockType, inputName, blockDefs) {
  const def = blockDefs[blockType];
  if (!def) return { check: null };
  // Scan args for input_value entries
  for (let i = 0; i < 10; i++) {
    const args = def.definition[`args${i}`];
    if (!args) continue;
    for (const arg of args) {
      if (arg.type === 'input_value' && arg.name === inputName) {
        return { check: arg.check || null };
      }
    }
  }
  return { check: null };
}

// Create a value input block for a given value
function makeValueBlock(value, check) {
  if (check === 'Pin') {
    return { type: 'esp32_gpio_pin', id: uid(), fields: { PIN: String(value) } };
  }
  // Default: number block
  return { type: 'math_number', id: uid(), fields: { NUM: Number(value) } };
}

// Compile a single DSL block into a Blockly block object
// DSL format: { type, var?, fields?, inputs?, body/do?, [custom fields directly] }
function compileBlock(dsl, variables, blockDefs) {
  const blockType = dsl.type;
  const block = { type: blockType, id: uid() };

  // Determine which keys are fields, inputs, and special
  const specialKeys = new Set(['type', 'var', 'body', 'do', 'then', 'else_if', 'else', 'condition', 'if', 'value', 'num', 'steps', 'function_name', 'args', 'joints']);
  const def = blockDefs[blockType];

  // --- Handle built-in blocks specially ---

  // controls_repeat_ext: { type, times, body }
  if (blockType === 'controls_repeat_ext') {
    block.inputs = {
      TIMES: { block: makeValueBlock(dsl.times ?? 10, 'Number') },
    };
    if (dsl.body) {
      block.inputs.DO = { block: compileChain(dsl.body, variables, blockDefs) };
    }
    return block;
  }

  // controls_whileUntil: { type, mode, condition, body }
  if (blockType === 'controls_whileUntil') {
    block.fields = { MODE: dsl.mode || 'WHILE' };
    if (dsl.condition) {
      block.inputs = { BOOL: { block: compileBlock(dsl.condition, variables, blockDefs) } };
    }
    if (dsl.body) {
      block.inputs = block.inputs || {};
      block.inputs.DO = { block: compileChain(dsl.body, variables, blockDefs) };
    }
    return block;
  }

  // controls_for: { type, var, from, to, by, body }
  if (blockType === 'controls_for') {
    const varName = dsl.var || 'i';
    ensureVariable(variables, varName);
    block.fields = { VAR: { id: variables[varName], name: varName, type: '' } };
    block.inputs = {
      FROM: { block: makeValueBlock(dsl.from ?? 0, 'Number') },
      TO: { block: makeValueBlock(dsl.to ?? 10, 'Number') },
      BY: { block: makeValueBlock(dsl.by ?? 1, 'Number') },
    };
    if (dsl.body) {
      block.inputs.DO = { block: compileChain(dsl.body, variables, blockDefs) };
    }
    return block;
  }

  // controls_forEach: { type, var, list, body }
  if (blockType === 'controls_forEach') {
    const varName = dsl.var || 'item';
    ensureVariable(variables, varName);
    block.fields = { VAR: { id: variables[varName], name: varName, type: '' } };
    block.inputs = {};
    if (dsl.list) {
      block.inputs.LIST = { block: compileBlock(dsl.list, variables, blockDefs) };
    }
    if (dsl.body) {
      block.inputs.DO = { block: compileChain(dsl.body, variables, blockDefs) };
    }
    return block;
  }

  // "forever" loop — sugar for controls_whileUntil WHILE true
  if (blockType === 'forever') {
    block.type = 'controls_whileUntil';
    block.fields = { MODE: 'WHILE' };
    block.inputs = {
      BOOL: { block: { type: 'logic_boolean', id: uid(), fields: { BOOL: 'TRUE' } } },
    };
    if (dsl.body) {
      const bodyChain = compileChain(dsl.body, variables, blockDefs);
      if (bodyChain) {
        block.inputs.DO = { block: bodyChain };
      } else {
        console.warn('[DSL Compiler] forever body compiled to null. DSL body:', JSON.stringify(dsl.body));
      }
    }
    return block;
  }

  // controls_if: { type, if0, do0, if1?, do1?, else? }
  // Aliases: condition/then/else, if/do/else
  if (blockType === 'controls_if') {
    block.inputs = {};
    let elseIfCount = 0;
    for (let i = 0; i < 20; i++) {
      const cond = dsl[`if${i}`] || (i === 0 ? (dsl.condition || dsl.if) : null);
      const body = dsl[`do${i}`] || (i === 0 ? (dsl.then || dsl.body) : null);
      if (!cond && i > 0) break;
      if (cond) block.inputs[`IF${i}`] = { block: compileBlock(cond, variables, blockDefs) };
      if (body) block.inputs[`DO${i}`] = { block: compileChain(body, variables, blockDefs) };
      if (i > 0) elseIfCount++;
    }
    const hasElse = !!dsl.else;
    if (hasElse) {
      block.inputs.ELSE = { block: compileChain(dsl.else, variables, blockDefs) };
    }
    if (elseIfCount > 0 || hasElse) {
      block.extraState = { elseIfCount, hasElse };
    }
    return block;
  }

  // logic_compare: { type, op, a, b }
  if (blockType === 'logic_compare') {
    block.fields = { OP: dsl.op || 'EQ' };
    block.inputs = {};
    if (dsl.a) block.inputs.A = { block: compileExpression(dsl.a, variables, blockDefs) };
    if (dsl.b) block.inputs.B = { block: compileExpression(dsl.b, variables, blockDefs) };
    return block;
  }

  // logic_operation: { type, op, a, b }
  if (blockType === 'logic_operation') {
    block.fields = { OP: dsl.op || 'AND' };
    block.inputs = {};
    if (dsl.a) block.inputs.A = { block: compileExpression(dsl.a, variables, blockDefs) };
    if (dsl.b) block.inputs.B = { block: compileExpression(dsl.b, variables, blockDefs) };
    return block;
  }

  // logic_negate: { type, value }
  if (blockType === 'logic_negate') {
    block.inputs = {};
    if (dsl.value != null) block.inputs.BOOL = { block: compileExpression(dsl.value, variables, blockDefs) };
    return block;
  }

  // logic_boolean: { type, value }
  if (blockType === 'logic_boolean') {
    block.fields = { BOOL: dsl.value === false ? 'FALSE' : 'TRUE' };
    return block;
  }

  // math_number: { type, value } — also accepts 'num' alias
  if (blockType === 'math_number') {
    block.fields = { NUM: dsl.value ?? dsl.num ?? 0 };
    return block;
  }

  // math_arithmetic: { type, op, a, b }
  if (blockType === 'math_arithmetic') {
    block.fields = { OP: dsl.op || 'ADD' };
    block.inputs = {};
    if (dsl.a) block.inputs.A = { block: compileExpression(dsl.a, variables, blockDefs) };
    if (dsl.b) block.inputs.B = { block: compileExpression(dsl.b, variables, blockDefs) };
    return block;
  }

  // math_modulo: { type, a, b }
  if (blockType === 'math_modulo') {
    block.inputs = {};
    if (dsl.a) block.inputs.DIVIDEND = { block: compileExpression(dsl.a, variables, blockDefs) };
    if (dsl.b) block.inputs.DIVISOR = { block: compileExpression(dsl.b, variables, blockDefs) };
    return block;
  }

  // variables_set: { type, var, value }
  if (blockType === 'variables_set') {
    const varName = dsl.var || 'x';
    ensureVariable(variables, varName);
    block.fields = { VAR: { id: variables[varName], name: varName, type: '' } };
    block.inputs = {};
    if (dsl.value != null) block.inputs.VALUE = { block: compileExpression(dsl.value, variables, blockDefs) };
    return block;
  }

  // variables_get: { type, var }
  if (blockType === 'variables_get') {
    const varName = dsl.var || 'x';
    ensureVariable(variables, varName);
    block.fields = { VAR: { id: variables[varName], name: varName, type: '' } };
    return block;
  }

  // procedures_defnoreturn: { type, name, args?, body }
  if (blockType === 'procedures_defnoreturn') {
    block.fields = { NAME: dsl.name || 'myFunction' };
    if (dsl.body) {
      block.inputs = { STACK: { block: compileChain(dsl.body, variables, blockDefs) } };
    }
    if (dsl.args && dsl.args.length > 0) {
      block.extraState = { params: dsl.args.map(a => typeof a === 'string' ? { name: a } : a) };
    }
    return block;
  }

  // procedures_defreturn: { type, name, args?, body, return_value }
  if (blockType === 'procedures_defreturn') {
    block.fields = { NAME: dsl.name || 'myFunction' };
    block.inputs = {};
    if (dsl.body) {
      block.inputs.STACK = { block: compileChain(dsl.body, variables, blockDefs) };
    }
    if (dsl.return_value != null) {
      block.inputs.RETURN = { block: compileExpression(dsl.return_value, variables, blockDefs) };
    }
    if (dsl.args && dsl.args.length > 0) {
      block.extraState = { params: dsl.args.map(a => typeof a === 'string' ? { name: a } : a) };
    }
    return block;
  }

  // procedures_callnoreturn / procedures_callreturn: { type, name, args? }
  if (blockType === 'procedures_callnoreturn' || blockType === 'procedures_callreturn') {
    block.extraState = { name: dsl.name || 'myFunction' };
    if (dsl.args && dsl.args.length > 0) {
      block.extraState.params = dsl.args.map(() => '');
      block.inputs = {};
      dsl.args.forEach((arg, i) => {
        block.inputs[`ARG${i}`] = { block: compileExpression(arg, variables, blockDefs) };
      });
    }
    return block;
  }

  // wait_seconds: { type, seconds }
  if (blockType === 'wait_seconds') {
    block.fields = { SECONDS: dsl.seconds ?? 1 };
    return block;
  }

  // utilities_print: { type, text, value }
  if (blockType === 'utilities_print') {
    block.fields = { TEXT: dsl.text ?? '' };
    if (dsl.value != null) {
      block.inputs = { VALUE: { block: compileExpression(dsl.value, variables, blockDefs) } };
    }
    return block;
  }

  // utilities_elapsed_time: { type }
  if (blockType === 'utilities_elapsed_time') {
    return block;
  }

  // controls_flow_statements: { type, flow } (break/continue)
  if (blockType === 'controls_flow_statements') {
    block.fields = { FLOW: dsl.flow || 'BREAK' };
    return block;
  }

  // --- Package-defined blocks (generic handler) ---
  if (def) {
    block.fields = {};
    block.inputs = {};

    // Collect all field and input definitions from the block definition
    const fieldDefs = {};
    const inputDefs = {};
    for (let i = 0; i < 10; i++) {
      const args = def.definition[`args${i}`];
      if (!args) continue;
      for (const arg of args) {
        if (arg.type === 'input_value') {
          inputDefs[arg.name] = arg;
        } else if (arg.type.startsWith('field_')) {
          fieldDefs[arg.name] = arg;
        }
      }
    }

    // Handle VAR field from dsl.var
    if (dsl.var && fieldDefs.VAR) {
      const varName = dsl.var;
      ensureVariable(variables, varName);
      block.fields.VAR = { id: variables[varName], name: varName, type: '' };
    }

    // Handle array shorthand: e.g. "joints": [v1, v2, ...] → map to ordered input_value fields
    if (dsl.joints && Array.isArray(dsl.joints)) {
      const inputNames = Object.keys(inputDefs);
      dsl.joints.forEach((val, i) => {
        if (i < inputNames.length) {
          const name = inputNames[i];
          block.inputs[name] = { block: makeValueBlock(val, inputDefs[name].check || null) };
        }
      });
    }

    // Map remaining DSL keys to fields or inputs
    for (const [key, value] of Object.entries(dsl)) {
      if (specialKeys.has(key) || key === 'var') continue;

      const upperKey = key.toUpperCase();

      // Check if it's a known field
      if (fieldDefs[upperKey]) {
        if (fieldDefs[upperKey].type === 'field_variable') {
          const varName = value;
          ensureVariable(variables, varName);
          block.fields[upperKey] = { id: variables[varName], name: varName, type: '' };
        } else {
          block.fields[upperKey] = value;
        }
      }
      // Check if it's a known input
      else if (inputDefs[upperKey]) {
        const check = inputDefs[upperKey].check || null;
        if (typeof value === 'object' && value !== null && value.type) {
          // It's a nested block DSL
          block.inputs[upperKey] = { block: compileBlock(value, variables, blockDefs) };
        } else {
          // It's a literal value — wrap in appropriate block
          block.inputs[upperKey] = { block: makeValueBlock(value, check) };
        }
      }
    }

    // Clean up empty objects
    if (Object.keys(block.fields).length === 0) delete block.fields;
    if (Object.keys(block.inputs).length === 0) delete block.inputs;

    return block;
  }

  // Unknown block type — pass through what we can
  console.warn(`DSL compiler: unknown block type "${blockType}"`);
  block.fields = {};
  for (const [key, value] of Object.entries(dsl)) {
    if (specialKeys.has(key)) continue;
    block.fields[key.toUpperCase()] = value;
  }
  if (Object.keys(block.fields).length === 0) delete block.fields;
  return block;
}

// Compile an expression — could be a literal number, a string var name, or a nested block
function compileExpression(expr, variables, blockDefs) {
  if (expr === null || expr === undefined) {
    return { type: 'math_number', id: uid(), fields: { NUM: 0 } };
  }
  if (typeof expr === 'number') {
    return { type: 'math_number', id: uid(), fields: { NUM: expr } };
  }
  if (typeof expr === 'boolean') {
    return { type: 'logic_boolean', id: uid(), fields: { BOOL: expr ? 'TRUE' : 'FALSE' } };
  }
  if (typeof expr === 'string') {
    // Treat as variable reference
    ensureVariable(variables, expr);
    return { type: 'variables_get', id: uid(), fields: { VAR: { id: variables[expr], name: expr, type: '' } } };
  }
  if (typeof expr === 'object' && expr.type) {
    return compileBlock(expr, variables, blockDefs);
  }
  // Fallback
  return { type: 'math_number', id: uid(), fields: { NUM: 0 } };
}

// Compile an array of DSL blocks into a chain (linked via next)
// Block types that are expression-only (have output connection but no previous/next)
const EXPRESSION_BLOCKS = new Set([
  'math_number', 'math_arithmetic', 'math_modulo', 'math_single', 'math_constrain',
  'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean',
  'variables_get', 'utilities_elapsed_time',
]);

function compileChain(blocks, variables, blockDefs) {
  if (!Array.isArray(blocks)) blocks = [blocks];
  if (blocks.length === 0) return null;

  // Filter out expression-only blocks that can't be chained as statements
  const stmtBlocks = blocks.filter(b => !EXPRESSION_BLOCKS.has(b.type));
  if (stmtBlocks.length === 0) return null;

  const compiled = stmtBlocks.map(b => compileBlock(b, variables, blockDefs));

  // Link via next
  for (let i = 0; i < compiled.length - 1; i++) {
    compiled[i].next = { block: compiled[i + 1] };
  }
  return compiled[0];
}

// Ensure a variable exists in the variables map (name -> id)
function ensureVariable(variables, name) {
  if (!variables[name]) {
    variables[name] = 'v_' + name.replace(/\W/g, '_');
  }
}

// Main entry: compile a DSL program into Blockly workspace JSON
export function compileDSL(program) {
  _nextId = 0;
  const blockDefs = getBlockDefs();
  const variables = {}; // name -> id

  // program.blocks is an array of top-level block chains
  const topLevelBlocks = [];
  let y = 50;

  for (const chain of program.blocks) {
    const blocks = Array.isArray(chain) ? chain : [chain];
    const first = compileChain(blocks, variables, blockDefs);
    if (first) {
      first.x = 50;
      first.y = y;
      y += 200;
      topLevelBlocks.push(first);
    }
  }

  // Build variables array
  const variablesArray = Object.entries(variables).map(([name, id]) => ({
    name,
    id,
    type: '',
  }));

  return {
    variables: variablesArray,
    blocks: {
      languageVersion: 0,
      blocks: topLevelBlocks,
    },
  };
}
