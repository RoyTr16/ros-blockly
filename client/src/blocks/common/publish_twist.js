import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { generateROS2Publish } from '../../generators/utils';

// Block Definition
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

// Generator Definition
javascriptGenerator.forBlock['ros_publish_twist'] = function(block, generator) {
  var topic_name = block.getFieldValue('TOPIC');
  var linear_x = generator.valueToCode(block, 'LINEAR', generator.ORDER_ATOMIC) || '0';
  var angular_z = generator.valueToCode(block, 'ANGULAR', generator.ORDER_ATOMIC) || '0';

  // Construct the message object string dynamically to inject variable code
  var messageContent = `{
    linear: { x: ${linear_x}, y: 0.0, z: 0.0 },
    angular: { x: 0.0, y: 0.0, z: ${angular_z} }
  }`;

  return generateROS2Publish(topic_name, 'geometry_msgs/msg/Twist', messageContent);
};
