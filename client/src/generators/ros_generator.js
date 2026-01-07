import { javascriptGenerator } from 'blockly/javascript';

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
