import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

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
      .appendField('Show Graph')
      .appendField(new Blockly.FieldVariable('myGraph'), 'VAR');
    this.setColour(260);
    this.setTooltip('Display a live chart for this graph variable. Place multiple to see multiple graphs.');
  },
};

javascriptGenerator.forBlock['utilities_graph_viewer'] = function () {
  return '';
};
