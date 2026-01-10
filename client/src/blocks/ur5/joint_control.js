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
    this.setTooltip("Move UR5 joints to specified positions using Trajectory Message");
    this.setHelpUrl("");
  }
};

// Generator
javascriptGenerator.forBlock['ur5_move_joints'] = function(block, generator) {
  const duration = block.getFieldValue('DURATION');

  // Get joint values
  const shoulder_pan = javascriptGenerator.valueToCode(block, 'ur5_rg2::shoulder_pan_joint', javascriptGenerator.ORDER_ATOMIC) || '0';
  const shoulder_lift = javascriptGenerator.valueToCode(block, 'ur5_rg2::shoulder_lift_joint', javascriptGenerator.ORDER_ATOMIC) || '0';
  const elbow = javascriptGenerator.valueToCode(block, 'ur5_rg2::elbow_joint', javascriptGenerator.ORDER_ATOMIC) || '0';
  const wrist_1 = javascriptGenerator.valueToCode(block, 'ur5_rg2::wrist_1_joint', javascriptGenerator.ORDER_ATOMIC) || '0';
  const wrist_2 = javascriptGenerator.valueToCode(block, 'ur5_rg2::wrist_2_joint', javascriptGenerator.ORDER_ATOMIC) || '0';
  const wrist_3 = javascriptGenerator.valueToCode(block, 'ur5_rg2::wrist_3_joint', javascriptGenerator.ORDER_ATOMIC) || '0';

  const code = `
    // Create Trajectory Message
    var topic = new ROSLIB.Topic({
      ros : ros,
      name : '/ur5/trajectory',
      messageType : 'trajectory_msgs/msg/JointTrajectory'
    });

    var msg = new ROSLIB.Message({
      joint_names: [
        'ur5_rg2::shoulder_pan_joint', 'ur5_rg2::shoulder_lift_joint', 'ur5_rg2::elbow_joint',
        'ur5_rg2::wrist_1_joint', 'ur5_rg2::wrist_2_joint', 'ur5_rg2::wrist_3_joint'
      ],
      points: [
        {
          positions: [${shoulder_pan}, ${shoulder_lift}, ${elbow}, ${wrist_1}, ${wrist_2}, ${wrist_3}],
          time_from_start: { sec: ${Math.max(1, Math.floor(duration))}, nanosec: 0 }
        }
      ]
    });

    topic.publish(msg);
    console.log('Published Trajectory Message to /ur5/trajectory');
    await wait(${duration});
  `;

  return code;
};
