// DSL Decompiler: Blockly workspace JSON → DSL format
// Converts the Blockly serialization format back into the compact DSL
// that the LLM uses to create/modify programs.

import { getLoadedPackages } from '../packages/PackageLoader';

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

// Get input metadata for a package-defined block
function getInputMeta(blockType, inputName, blockDefs) {
  const def = blockDefs[blockType];
  if (!def) return null;
  for (let i = 0; i < 10; i++) {
    const args = def.definition[`args${i}`];
    if (!args) continue;
    for (const arg of args) {
      if (arg.name === inputName) return arg;
    }
  }
  return null;
}

// Build variable ID → name map from workspace-level variable list
function buildVarMap(workspaceJson) {
  const map = {};
  if (workspaceJson?.variables) {
    for (const v of workspaceJson.variables) {
      if (v.id && v.name) map[v.id] = v.name;
    }
  }
  return map;
}

// Resolve a variable field value to its name using the var map
function resolveVar(v, varMap, fallback = 'x') {
  if (!v) return fallback;
  if (typeof v === 'object') {
    // Try name first, then look up id in varMap
    return v.name || varMap[v.id] || fallback;
  }
  // Could be a raw string name or an id
  return varMap[v] || v || fallback;
}

// Decompile an expression block into DSL expression format
// Returns: number, string (variable name), boolean, or { type, ... } object
function decompileExpr(block, blockDefs, varMap) {
  if (!block) return 0;

  const t = block.type;

  // math_number → just the number
  if (t === 'math_number') {
    return block.fields?.NUM ?? 0;
  }

  // logic_boolean → true/false
  if (t === 'logic_boolean') {
    return block.fields?.BOOL === 'TRUE';
  }

  // variables_get → variable name string
  if (t === 'variables_get') {
    return resolveVar(block.fields?.VAR, varMap, 'x');
  }

  // esp32_gpio_pin → just the pin number
  if (t === 'esp32_gpio_pin') {
    return Number(block.fields?.PIN ?? 0);
  }

  // math_arithmetic
  if (t === 'math_arithmetic') {
    const dsl = { type: 'math_arithmetic', op: block.fields?.OP || 'ADD' };
    if (block.inputs?.A?.block) dsl.a = decompileExpr(block.inputs.A.block, blockDefs, varMap);
    if (block.inputs?.B?.block) dsl.b = decompileExpr(block.inputs.B.block, blockDefs, varMap);
    return dsl;
  }

  // math_modulo
  if (t === 'math_modulo') {
    const dsl = { type: 'math_modulo' };
    if (block.inputs?.DIVIDEND?.block) dsl.a = decompileExpr(block.inputs.DIVIDEND.block, blockDefs, varMap);
    if (block.inputs?.DIVISOR?.block) dsl.b = decompileExpr(block.inputs.DIVISOR.block, blockDefs, varMap);
    return dsl;
  }

  // logic_compare
  if (t === 'logic_compare') {
    const dsl = { type: 'logic_compare', op: block.fields?.OP || 'EQ' };
    if (block.inputs?.A?.block) dsl.a = decompileExpr(block.inputs.A.block, blockDefs, varMap);
    if (block.inputs?.B?.block) dsl.b = decompileExpr(block.inputs.B.block, blockDefs, varMap);
    return dsl;
  }

  // logic_operation
  if (t === 'logic_operation') {
    const dsl = { type: 'logic_operation', op: block.fields?.OP || 'AND' };
    if (block.inputs?.A?.block) dsl.a = decompileExpr(block.inputs.A.block, blockDefs, varMap);
    if (block.inputs?.B?.block) dsl.b = decompileExpr(block.inputs.B.block, blockDefs, varMap);
    return dsl;
  }

  // logic_negate
  if (t === 'logic_negate') {
    const dsl = { type: 'logic_negate' };
    if (block.inputs?.BOOL?.block) dsl.value = decompileExpr(block.inputs.BOOL.block, blockDefs, varMap);
    return dsl;
  }

  // utilities_elapsed_time
  if (t === 'utilities_elapsed_time') {
    return { type: 'utilities_elapsed_time' };
  }

  // procedures_callreturn (expression)
  if (t === 'procedures_callreturn') {
    return decompileBlock(block, blockDefs, varMap);
  }

  // Fallback: try generic decompile
  return decompileBlock(block, blockDefs, varMap);
}

// Decompile a chain (block + next links) into an array of DSL blocks
function decompileChain(block, blockDefs, varMap) {
  const chain = [];
  let current = block;
  while (current) {
    chain.push(decompileBlock(current, blockDefs, varMap));
    current = current.next?.block;
  }
  return chain;
}

// Decompile a single Blockly block into DSL format
function decompileBlock(block, blockDefs, varMap) {
  if (!block) return null;
  const t = block.type;

  // controls_whileUntil → detect "forever" sugar
  if (t === 'controls_whileUntil') {
    const mode = block.fields?.MODE || 'WHILE';
    const boolBlock = block.inputs?.BOOL?.block;
    const isForever = mode === 'WHILE' && boolBlock?.type === 'logic_boolean' && boolBlock.fields?.BOOL === 'TRUE';

    if (isForever) {
      const dsl = { type: 'forever' };
      if (block.inputs?.DO?.block) dsl.body = decompileChain(block.inputs.DO.block, blockDefs, varMap);
      return dsl;
    }

    const dsl = { type: 'controls_whileUntil', mode };
    if (boolBlock) dsl.condition = decompileExpr(boolBlock, blockDefs, varMap);
    if (block.inputs?.DO?.block) dsl.body = decompileChain(block.inputs.DO.block, blockDefs, varMap);
    return dsl;
  }

  // controls_repeat_ext
  if (t === 'controls_repeat_ext') {
    const dsl = { type: 'controls_repeat_ext' };
    if (block.inputs?.TIMES?.block) dsl.times = decompileExpr(block.inputs.TIMES.block, blockDefs, varMap);
    if (block.inputs?.DO?.block) dsl.body = decompileChain(block.inputs.DO.block, blockDefs, varMap);
    return dsl;
  }

  // controls_for
  if (t === 'controls_for') {
    const dsl = { type: 'controls_for', var: resolveVar(block.fields?.VAR, varMap, 'i') };
    if (block.inputs?.FROM?.block) dsl.from = decompileExpr(block.inputs.FROM.block, blockDefs, varMap);
    if (block.inputs?.TO?.block) dsl.to = decompileExpr(block.inputs.TO.block, blockDefs, varMap);
    if (block.inputs?.BY?.block) dsl.by = decompileExpr(block.inputs.BY.block, blockDefs, varMap);
    if (block.inputs?.DO?.block) dsl.body = decompileChain(block.inputs.DO.block, blockDefs, varMap);
    return dsl;
  }

  // controls_forEach
  if (t === 'controls_forEach') {
    const dsl = { type: 'controls_forEach', var: resolveVar(block.fields?.VAR, varMap, 'item') };
    if (block.inputs?.LIST?.block) dsl.list = decompileExpr(block.inputs.LIST.block, blockDefs, varMap);
    if (block.inputs?.DO?.block) dsl.body = decompileChain(block.inputs.DO.block, blockDefs, varMap);
    return dsl;
  }

  // controls_if
  if (t === 'controls_if') {
    const dsl = { type: 'controls_if' };
    for (let i = 0; i < 20; i++) {
      const condBlock = block.inputs?.[`IF${i}`]?.block;
      const bodyBlock = block.inputs?.[`DO${i}`]?.block;
      if (!condBlock && i > 0) break;
      if (condBlock) dsl[`if${i}`] = decompileExpr(condBlock, blockDefs, varMap);
      if (bodyBlock) dsl[`do${i}`] = decompileChain(bodyBlock, blockDefs, varMap);
    }
    if (block.inputs?.ELSE?.block) dsl.else = decompileChain(block.inputs.ELSE.block, blockDefs, varMap);
    return dsl;
  }

  // variables_set
  if (t === 'variables_set') {
    const dsl = { type: 'variables_set', var: resolveVar(block.fields?.VAR, varMap, 'x') };
    if (block.inputs?.VALUE?.block) dsl.value = decompileExpr(block.inputs.VALUE.block, blockDefs, varMap);
    return dsl;
  }

  // procedures_defnoreturn
  if (t === 'procedures_defnoreturn') {
    const dsl = { type: 'procedures_defnoreturn', name: block.fields?.NAME || 'myFunction' };
    if (block.extraState?.params) dsl.args = block.extraState.params.map(p => p.name || p);
    if (block.inputs?.STACK?.block) dsl.body = decompileChain(block.inputs.STACK.block, blockDefs, varMap);
    return dsl;
  }

  // procedures_defreturn
  if (t === 'procedures_defreturn') {
    const dsl = { type: 'procedures_defreturn', name: block.fields?.NAME || 'myFunction' };
    if (block.extraState?.params) dsl.args = block.extraState.params.map(p => p.name || p);
    if (block.inputs?.STACK?.block) dsl.body = decompileChain(block.inputs.STACK.block, blockDefs, varMap);
    if (block.inputs?.RETURN?.block) dsl.return_value = decompileExpr(block.inputs.RETURN.block, blockDefs, varMap);
    return dsl;
  }

  // procedures_callnoreturn / procedures_callreturn
  if (t === 'procedures_callnoreturn' || t === 'procedures_callreturn') {
    const dsl = { type: t, name: block.extraState?.name || 'myFunction' };
    if (block.extraState?.params?.length) {
      dsl.args = block.extraState.params.map((_, i) => {
        const inp = block.inputs?.[`ARG${i}`]?.block;
        return inp ? decompileExpr(inp, blockDefs, varMap) : 0;
      });
    }
    return dsl;
  }

  // wait_seconds
  if (t === 'wait_seconds') {
    const secBlock = block.inputs?.SECONDS?.block;
    return { type: 'wait_seconds', seconds: secBlock ? decompileExpr(secBlock, blockDefs, varMap) : 1 };
  }

  // utilities_print
  if (t === 'utilities_print') {
    const dsl = { type: 'utilities_print', text: block.fields?.TEXT ?? '' };
    if (block.inputs?.VALUE?.block) dsl.value = decompileExpr(block.inputs.VALUE.block, blockDefs, varMap);
    return dsl;
  }

  // controls_flow_statements
  if (t === 'controls_flow_statements') {
    return { type: 'controls_flow_statements', flow: block.fields?.FLOW || 'BREAK' };
  }

  // utilities_setup_graph
  if (t === 'utilities_setup_graph') {
    return {
      type: 'utilities_setup_graph',
      var: resolveVar(block.fields?.VAR, varMap, 'myGraph'),
      x_label: block.fields?.X_LABEL ?? 'Time (s)',
      y_label: block.fields?.Y_LABEL ?? 'Value',
      color: block.fields?.COLOR ?? '#4285f4',
      style: block.fields?.STYLE ?? 'line',
    };
  }

  // utilities_plot_point
  if (t === 'utilities_plot_point') {
    const dsl = { type: 'utilities_plot_point', var: resolveVar(block.fields?.VAR, varMap, 'myGraph') };
    if (block.inputs?.X?.block) dsl.x = decompileExpr(block.inputs.X.block, blockDefs, varMap);
    if (block.inputs?.Y?.block) dsl.y = decompileExpr(block.inputs.Y.block, blockDefs, varMap);
    return dsl;
  }

  // utilities_graph_viewer
  if (t === 'utilities_graph_viewer') {
    return { type: 'utilities_graph_viewer', var: resolveVar(block.fields?.VAR, varMap, 'myGraph') };
  }

  // --- Package-defined blocks (generic handler) ---
  const def = blockDefs[t];
  if (def) {
    const dsl = { type: t };

    // Collect field/input definitions
    const fieldDefs = {};
    const inputDefs = {};
    for (let i = 0; i < 10; i++) {
      const args = def.definition[`args${i}`];
      if (!args) continue;
      for (const arg of args) {
        if (arg.type === 'input_value') inputDefs[arg.name] = arg;
        else if (arg.type?.startsWith('field_')) fieldDefs[arg.name] = arg;
      }
    }

    // Fields
    if (block.fields) {
      for (const [key, value] of Object.entries(block.fields)) {
        if (key === 'VAR') {
          dsl.var = resolveVar(value, varMap, '');
        } else if (fieldDefs[key]) {
          dsl[key.toLowerCase()] = typeof value === 'object' ? (value.name || value.id || value) : value;
        }
      }
    }

    // Inputs
    if (block.inputs) {
      for (const [key, inp] of Object.entries(block.inputs)) {
        if (!inp.block) continue;
        const meta = inputDefs[key];
        if (meta?.check === 'Pin' && inp.block.type === 'esp32_gpio_pin') {
          dsl[key.toLowerCase()] = Number(inp.block.fields?.PIN ?? 0);
        } else {
          dsl[key.toLowerCase()] = decompileExpr(inp.block, blockDefs, varMap);
        }
      }
    }

    return dsl;
  }

  // Unknown block — best effort
  const dsl = { type: t };
  if (block.fields) {
    for (const [key, value] of Object.entries(block.fields)) {
      dsl[key.toLowerCase()] = typeof value === 'object' ? value.name : value;
    }
  }
  return dsl;
}

/**
 * Decompile a Blockly workspace JSON into DSL format (array of chains).
 * @param {Object} workspaceJson - Blockly serialization output (from Blockly.serialization.workspaces.save)
 * @returns {Array} Array of chains, each chain is an array of DSL block objects
 */
export function decompileDSL(workspaceJson) {
  if (!workspaceJson?.blocks?.blocks?.length) return [];
  const blockDefs = getBlockDefs();
  const varMap = buildVarMap(workspaceJson);
  return workspaceJson.blocks.blocks.map(topBlock => decompileChain(topBlock, blockDefs, varMap));
}
