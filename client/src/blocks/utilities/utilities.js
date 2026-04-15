import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

// --- Eye toggle field (click to toggle visibility) ---
const EYE_OPEN = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8eaf0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
  '<circle cx="12" cy="12" r="3"/></svg>'
);
const EYE_CLOSED = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ea3b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
  '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
  '<line x1="1" y1="1" x2="23" y2="23"/></svg>'
);

class FieldEyeToggle extends Blockly.FieldImage {
  constructor(initialValue) {
    const isOn = initialValue === 'TRUE';
    super(isOn ? EYE_OPEN : EYE_CLOSED, 16, 16, 'Toggle visibility');
    this.EDITABLE = true;
    this.SERIALIZABLE = true;
    this.CURSOR = 'pointer';
    this.toggled_ = isOn;
  }

  static fromJson(options) {
    return new FieldEyeToggle(options?.value || 'FALSE');
  }

  showEditor_() {
    this.toggled_ = !this.toggled_;
    this.setValue(this.toggled_ ? 'TRUE' : 'FALSE');
    // FieldImage clicks don't fire workspace change events, so notify manually
    window.rosBlockly?.onGraphToggle?.();
  }

  initView() {
    super.initView();
    // Fix the image after FieldImage creates the DOM — value_ may be 'TRUE'/'FALSE'
    const img = this.fieldGroup_?.querySelector('image');
    if (img) {
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href',
        this.toggled_ ? EYE_OPEN : EYE_CLOSED);
    }
  }

  doValueUpdate_(newValue) {
    this.toggled_ = newValue === 'TRUE';
    this.value_ = newValue;
    this.isDirty_ = true;
    const src = this.toggled_ ? EYE_OPEN : EYE_CLOSED;
    // Update the underlying FieldImage src so it renders correctly
    this.src_ = src;
    if (this.fieldGroup_) {
      const img = this.fieldGroup_.querySelector('image');
      if (img) img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
    }
  }

  getValue() {
    return this.toggled_ ? 'TRUE' : 'FALSE';
  }

  toXml(fieldElement) {
    fieldElement.textContent = this.getValue();
    return fieldElement;
  }

  loadState(state) {
    this.setValue(state);
  }

  saveState() {
    return this.getValue();
  }
}

Blockly.fieldRegistry.register('field_eye_toggle', FieldEyeToggle);

// --- Wait Seconds block (core, used in Loops category) ---
Blockly.Blocks['wait_seconds'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Wait')
      .appendField(new Blockly.FieldNumber(1, 0), 'SECONDS')
      .appendField('seconds');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip('Pauses execution for the specified number of seconds.');
  },
};

javascriptGenerator.forBlock['wait_seconds'] = function (block) {
  const seconds = block.getFieldValue('SECONDS');
  return `await wait(${seconds});\n`;
};

// --- Print block: logs text + value to LogViewer ---
Blockly.Blocks['utilities_print'] = {
  init: function () {
    this.appendValueInput('VALUE')
      .appendField('Print')
      .appendField(new Blockly.FieldTextInput('Distance:'), 'TEXT');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip('Print a label and value to the log.');
  },
};

javascriptGenerator.forBlock['utilities_print'] = function (block) {
  const text = block.getFieldValue('TEXT');
  const value = javascriptGenerator.valueToCode(block, 'VALUE', Order.NONE) || "''";
  return `log(${JSON.stringify(text)} + ' ' + ${value});\n`;
};

// --- Elapsed Time (seconds since program start) ---
Blockly.Blocks['utilities_elapsed_time'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Elapsed Time (s)');
    this.setOutput(true, 'Number');
    this.setColour(160);
    this.setTooltip('Seconds elapsed since the program started running.');
  },
};

javascriptGenerator.forBlock['utilities_elapsed_time'] = function () {
  const code = '((Date.now() - (window.rosBlockly && window.rosBlockly.startTime || Date.now())) / 1000)';
  return [code, Order.DIVISION];
};

// --- Graph color options ---
const GRAPH_COLORS = [
  ['Blue', '#4285f4'],
  ['Red', '#ea4335'],
  ['Green', '#34a853'],
  ['Orange', '#fbbc05'],
  ['Purple', '#9334e6'],
  ['Cyan', '#00bcd4'],
  ['Pink', '#e91e63'],
];

const GRAPH_STYLES = [
  ['Line', 'line'],
  ['Scatter', 'scatter'],
];

// --- Setup Graph → variable ---
Blockly.Blocks['utilities_setup_graph'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Setup Graph')
      .appendField('→')
      .appendField(new Blockly.FieldVariable('myGraph'), 'VAR');
    this.appendDummyInput()
      .appendField('X:')
      .appendField(new Blockly.FieldTextInput('Time (s)'), 'X_LABEL')
      .appendField('Y:')
      .appendField(new Blockly.FieldTextInput('Distance (cm)'), 'Y_LABEL');
    this.appendDummyInput()
      .appendField('Color:')
      .appendField(new Blockly.FieldDropdown(GRAPH_COLORS), 'COLOR')
      .appendField('Style:')
      .appendField(new Blockly.FieldDropdown(GRAPH_STYLES), 'STYLE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip('Create a graph config and store it in a variable.');
  },
};

javascriptGenerator.forBlock['utilities_setup_graph'] = function (block) {
  const varName = javascriptGenerator.getVariableName(block.getFieldValue('VAR'));
  const displayName = block.getField('VAR').getText();
  const xLabel = block.getFieldValue('X_LABEL');
  const yLabel = block.getFieldValue('Y_LABEL');
  const color = block.getFieldValue('COLOR');
  const style = block.getFieldValue('STYLE');

  return `
    {
      ${varName} = { xLabel: ${JSON.stringify(xLabel)}, yLabel: ${JSON.stringify(yLabel)}, color: ${JSON.stringify(color)}, style: ${JSON.stringify(style)}, x: [], y: [] };
      if (!window.rosBlockly) window.rosBlockly = {};
      if (!window.rosBlockly.graphs) window.rosBlockly.graphs = {};
      window.rosBlockly.graphs[${JSON.stringify(displayName)}] = ${varName};
      if (window.rosBlockly.onGraphUpdate) window.rosBlockly.onGraphUpdate();
      log('Graph "${displayName}" initialized');
    }
  `;
};

// --- Plot Point to graph variable ---
Blockly.Blocks['utilities_plot_point'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Plot to')
      .appendField(new Blockly.FieldVariable('myGraph'), 'VAR');
    this.appendValueInput('X')
      .setCheck('Number')
      .appendField('X:');
    this.appendValueInput('Y')
      .setCheck('Number')
      .appendField('Y:');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip('Add a data point to the specified graph.');
  },
};

javascriptGenerator.forBlock['utilities_plot_point'] = function (block) {
  const varName = javascriptGenerator.getVariableName(block.getFieldValue('VAR'));
  const x = javascriptGenerator.valueToCode(block, 'X', Order.NONE) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', Order.NONE) || '0';

  return `
    {
      if (${varName} && ${varName}.x) {
        ${varName}.x.push(${x});
        ${varName}.y.push(${y});
        if (window.rosBlockly && window.rosBlockly.onGraphUpdate) window.rosBlockly.onGraphUpdate();
      }
    }
  `;
};

// --- Graph Viewer (visual only — no generated code) ---
Blockly.Blocks['utilities_graph_viewer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Graph')
      .appendField(new Blockly.FieldVariable('myGraph'), 'VAR')
      .appendField(new FieldEyeToggle('FALSE'), 'VISIBLE');
    this.setColour(260);
    this.setTooltip('Click the eye to show/hide a live chart for this graph variable.');
  },
};

javascriptGenerator.forBlock['utilities_graph_viewer'] = function () {
  return '';
};

// --- Override procedure generators to emit async functions ---
// Blockly's built-in generators emit regular `function` declarations,
// but our blocks use `await` (e.g. wait_seconds, ROS publishes).
// We override all four procedure generators to emit async functions
// and await their calls.

javascriptGenerator.forBlock['procedures_defreturn'] = function (block, generator) {
  const funcName = generator.getProcedureName(block.getFieldValue('NAME'));
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = generator.getVariableName(variables[i]);
  }
  let branch = '';
  if (block.getInput('STACK')) {
    branch = generator.statementToCode(block, 'STACK');
  }
  let returnValue = '';
  if (block.getInput('RETURN')) {
    returnValue = generator.valueToCode(block, 'RETURN', Order.NONE) || '';
  }
  if (returnValue) {
    returnValue = generator.INDENT + 'return ' + returnValue + ';\n';
  }
  let code = 'async function ' + funcName + '(' + args.join(', ') + ') {\n' +
    branch + returnValue + '}';
  code = generator.scrub_(block, code);
  generator.definitions_['%' + funcName] = code;
  return null;
};

javascriptGenerator.forBlock['procedures_defnoreturn'] =
  javascriptGenerator.forBlock['procedures_defreturn'];

javascriptGenerator.forBlock['procedures_callreturn'] = function (block, generator) {
  const funcName = generator.getProcedureName(block.getFieldValue('NAME'));
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = generator.valueToCode(block, 'ARG' + i, Order.NONE) || 'null';
  }
  const code = 'await ' + funcName + '(' + args.join(', ') + ')';
  return [code, Order.AWAIT];
};

javascriptGenerator.forBlock['procedures_callnoreturn'] = function (block, generator) {
  const tuple = generator.forBlock['procedures_callreturn'](block, generator);
  return tuple[0] + ';\n';
};
