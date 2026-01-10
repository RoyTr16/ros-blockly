import { javascriptGenerator } from 'blockly/javascript';

/**
 * Helper function to generate ROS publishing code.
 * @param {string} topicName - The name of the topic (e.g., '/cmd_vel').
 * @param {string} messageType - The ROS message type (e.g., 'geometry_msgs/msg/Twist').
 * @param {object|string} messageContent - The message content object or stringified JSON.
 * @returns {string} The generated JavaScript code.
 */
export function generateROS2Publish(topicName, messageType, messageContent) {
  // If messageContent is an object, stringify it. If it's a string (from another generator), use it directly.
  const contentString = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);

  return `
    var topic = new ROSLIB.Topic({
      ros : ros,
      name : '${topicName}',
      messageType : '${messageType}'
    });

    var msg = new ROSLIB.Message(${contentString});
    topic.publish(msg);
    console.log('Published to ${topicName}');
  `;
}
