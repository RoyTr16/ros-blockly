import * as Blockly from 'blockly/core';

// Generic Publish Twist Block
Blockly.Blocks['ros_publish_twist'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Publish Twist to")
        .appendField(new Blockly.FieldTextInput("/cmd_vel"), "TOPIC");
    this.appendValueInput("LINEAR")
        .setCheck("Number")
        .appendField("Linear X");
    this.appendValueInput("ANGULAR")
        .setCheck("Number")
        .appendField("Angular Z");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip("Publish a geometry_msgs/Twist message to a specified topic.");
    this.setHelpUrl("");
  }
};
