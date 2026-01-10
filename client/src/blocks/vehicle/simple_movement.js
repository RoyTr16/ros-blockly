import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';

// Block Definitions
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

// Generator Definitions
javascriptGenerator.forBlock['move_robot'] = function(block, generator) {
  var linear_x = block.getFieldValue('LINEAR_X');
  var angular_z = block.getFieldValue('ANGULAR_Z');

  var code = `
    // Clear any existing interval to avoid multiple loops
    if (window.rosBlockly && window.rosBlockly.interval) {
      console.log("Clearing existing interval:", window.rosBlockly.interval);
      clearInterval(window.rosBlockly.interval);
    }

    var cmdVel = new ROSLIB.Topic({
      ros : ros,
      name : '/cmd_vel',
      messageType : 'geometry_msgs/msg/Twist'
    });

    var twist = new ROSLIB.Message({
      linear : {
        x : ${linear_x},
        y : 0.0,
        z : 0.0
      },
      angular : {
        x : 0.0,
        y : 0.0,
        z : ${angular_z}
      }
    });

    // Publish immediately
    cmdVel.publish(twist);
    log('Moving: Linear=' + ${linear_x} + ', Angular=' + ${angular_z});

    // Publish continuously every 100ms to keep the robot moving
    if (!window.rosBlockly) window.rosBlockly = {};
    window.rosBlockly.interval = setInterval(function() {
      cmdVel.publish(twist);
    }, 100);
    console.log("Started interval:", window.rosBlockly.interval);
  `;
  return code;
};

javascriptGenerator.forBlock['stop_robot'] = function(block, generator) {
  var code = `
    // Stop the continuous publishing
    if (window.rosBlockly && window.rosBlockly.interval) {
      console.log("Clearing interval (Stop):", window.rosBlockly.interval);
      clearInterval(window.rosBlockly.interval);
      window.rosBlockly.interval = null;
    }

    var cmdVel = new ROSLIB.Topic({
      ros : ros,
      name : '/cmd_vel',
      messageType : 'geometry_msgs/msg/Twist'
    });

    var twist = new ROSLIB.Message({
      linear : {
        x : 0.0,
        y : 0.0,
        z : 0.0
      },
      angular : {
        x : 0.0,
        y : 0.0,
        z : 0.0
      }
    });
    cmdVel.publish(twist);
    log('Stopped robot');
  `;
  return code;
};
