import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';

// Block Definition
Blockly.Blocks['wait_seconds'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Wait")
        .appendField(new Blockly.FieldNumber(1, 0), "SECONDS")
        .appendField("seconds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip("Pauses execution for the specified number of seconds.");
    this.setHelpUrl("");
  }
};

// Generator
javascriptGenerator.forBlock['wait_seconds'] = function(block, generator) {
  const seconds = block.getFieldValue('SECONDS');
  return `await wait(${seconds});\n`;
};
