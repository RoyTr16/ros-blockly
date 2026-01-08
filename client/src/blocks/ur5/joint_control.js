import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { generateROS2Publish } from '../../generators/utils';

// Block Definition
Blockly.Blocks['ur5_move_joints'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Move UR5 Joints");

    const joints = [
      ['Shoulder Pan', 'ur5_rg2::shoulder_pan_joint'],
      ['Shoulder Lift', 'ur5_rg2::shoulder_lift_joint'],
      ['Elbow', 'ur5_rg2::elbow_joint'],
      ['Wrist 1', 'ur5_rg2::wrist_1_joint'],
      ['Wrist 2', 'ur5_rg2::wrist_2_joint'],
      ['Wrist 3', 'ur5_rg2::wrist_3_joint']
    ];

    joints.forEach(([label, name]) => {
      this.appendValueInput(name)
          .setCheck("Number")
          .setAlign(Blockly.ALIGN_RIGHT)
          .appendField(label);
    });

    this.appendDummyInput()
        .appendField("Duration (s)")
        .appendField(new Blockly.FieldNumber(2, 0), "DURATION");

    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setInputsInline(false);
    this.setColour(230);
    this.setTooltip("Move UR5 joints to specified positions (in radians)");
    this.setHelpUrl("");
  }
};

// Generator
javascriptGenerator.forBlock['ur5_move_joints'] = function(block, generator) {
  // Mapping of internal block ID to ROS topic
  const jointMap = [
    { id: 'ur5_rg2::shoulder_pan_joint', topic: '/ur5/shoulder_pan/cmd' },
    { id: 'ur5_rg2::shoulder_lift_joint', topic: '/ur5/shoulder_lift/cmd' },
    { id: 'ur5_rg2::elbow_joint', topic: '/ur5/elbow/cmd' },
    { id: 'ur5_rg2::wrist_1_joint', topic: '/ur5/wrist_1/cmd' },
    { id: 'ur5_rg2::wrist_2_joint', topic: '/ur5/wrist_2/cmd' },
    { id: 'ur5_rg2::wrist_3_joint', topic: '/ur5/wrist_3/cmd' }
  ];

  let code = `log('Moving UR5 joints (Position Control)...');\n`;

  jointMap.forEach(joint => {
    // Get value from block, default to 0
    const valCode = javascriptGenerator.valueToCode(block, joint.id, javascriptGenerator.ORDER_ATOMIC) || '0';

    // Generate publisher code for this joint
    code += `
    (function() {
      var topic = new ROSLIB.Topic({
        ros : ros,
        name : '${joint.topic}',
        messageType : 'std_msgs/msg/Float64'
      });
      var msg = new ROSLIB.Message({
        data : ${valCode}
      });
      topic.publish(msg);
    })();
    `;
  });

  return code;
};
