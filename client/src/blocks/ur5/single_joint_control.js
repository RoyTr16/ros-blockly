import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';

// Block Definition
Blockly.Blocks['ur5_move_single_joint'] = {
  init: function() {
    this.appendValueInput("POSITION")
        .setCheck("Number")
        .appendField("Move UR5")
        .appendField(new Blockly.FieldDropdown([
          ['Shoulder Pan', '/ur5/shoulder_pan/cmd'],
          ['Shoulder Lift', '/ur5/shoulder_lift/cmd'],
          ['Elbow', '/ur5/elbow/cmd'],
          ['Wrist 1', '/ur5/wrist_1/cmd'],
          ['Wrist 2', '/ur5/wrist_2/cmd'],
          ['Wrist 3', '/ur5/wrist_3/cmd']
        ]), "JOINT_TOPIC");

    this.appendDummyInput()
        .appendField("to position (radians)");

    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip("Move a single UR5 joint directly using Position Control");
    this.setHelpUrl("");
  }
};

// Generator
javascriptGenerator.forBlock['ur5_move_single_joint'] = function(block, generator) {
  const topicName = block.getFieldValue('JOINT_TOPIC');
  const position = javascriptGenerator.valueToCode(block, 'POSITION', javascriptGenerator.ORDER_ATOMIC) || '0';

  const code = `
    var topic = new ROSLIB.Topic({
      ros : ros,
      name : '${topicName}',
      messageType : 'std_msgs/msg/Float64'
    });

    var msg = new ROSLIB.Message({
      data : ${position}
    });

    topic.publish(msg);
    console.log('Published ${topicName}: ' + ${position});
  `;

  return code;
};
