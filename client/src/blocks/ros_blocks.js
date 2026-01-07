import * as Blockly from 'blockly/core';

// Define a custom block for moving the robot
Blockly.Blocks['move_robot'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Move Robot")
        .appendField("Linear X")
        .appendField(new Blockly.FieldNumber(0), "LINEAR_X")
        .appendField("Angular Z")
        .appendField(new Blockly.FieldNumber(0), "ANGULAR_Z");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip("Moves the robot with specified linear and angular velocities.");
    this.setHelpUrl("");
  }
};

// Define a block for stopping the robot
Blockly.Blocks['stop_robot'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Stop Robot");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(0);
    this.setTooltip("Stops the robot.");
    this.setHelpUrl("");
  }
};
