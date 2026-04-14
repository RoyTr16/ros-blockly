import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

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

// --- Setup Graph ---
Blockly.Blocks['utilities_setup_graph'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Setup Graph')
      .appendField('X:')
      .appendField(new Blockly.FieldTextInput('Time (s)'), 'X_LABEL')
      .appendField('Y:')
      .appendField(new Blockly.FieldTextInput('Distance (cm)'), 'Y_LABEL');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip('Initialize a 2D graph with given axis labels.');
  },
};

javascriptGenerator.forBlock['utilities_setup_graph'] = function (block) {
  const xLabel = block.getFieldValue('X_LABEL');
  const yLabel = block.getFieldValue('Y_LABEL');
  return `
    {
      if (!window.rosBlockly) window.rosBlockly = {};
      window.rosBlockly.graphData = { x: [], y: [], xLabel: ${JSON.stringify(xLabel)}, yLabel: ${JSON.stringify(yLabel)} };
      if (window.rosBlockly.onGraphUpdate) window.rosBlockly.onGraphUpdate(window.rosBlockly.graphData);
      log('Graph initialized: ' + ${JSON.stringify(xLabel)} + ' vs ' + ${JSON.stringify(yLabel)});
    }
  `;
};

// --- Plot Point ---
Blockly.Blocks['utilities_plot_point'] = {
  init: function () {
    this.appendValueInput('X')
      .setCheck('Number')
      .appendField('Plot X:');
    this.appendValueInput('Y')
      .setCheck('Number')
      .appendField('Y:');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip('Add a data point to the graph.');
  },
};

javascriptGenerator.forBlock['utilities_plot_point'] = function (block) {
  const x = javascriptGenerator.valueToCode(block, 'X', Order.NONE) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', Order.NONE) || '0';
  return `
    {
      if (window.rosBlockly && window.rosBlockly.graphData) {
        window.rosBlockly.graphData.x.push(${x});
        window.rosBlockly.graphData.y.push(${y});
        if (window.rosBlockly.onGraphUpdate) window.rosBlockly.onGraphUpdate(window.rosBlockly.graphData);
      }
    }
  `;
};
