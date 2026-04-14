import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

// --- Set Digital Pin ON ---
Blockly.Blocks['esp32_set_pin_on'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Set Pin');
    this.appendValueInput('PIN')
      .setCheck('Pin');
    this.appendDummyInput()
      .appendField('ON');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(15);
    this.setTooltip('Set a digital pin HIGH (3.3V).');
  },
};

javascriptGenerator.forBlock['esp32_set_pin_on'] = function (block) {
  const pin = javascriptGenerator.valueToCode(block, 'PIN', Order.ATOMIC) || '2';

  return `
    {
      var pinTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/digital_write',
        messageType: 'std_msgs/msg/Int32'
      });
      pinTopic.publish(new ROSLIB.Message({ data: ((${pin} << 8) | 1) }));
      log('Pin G' + ${pin} + ' -> ON');
    }
  `;
};

// --- Set Digital Pin OFF ---
Blockly.Blocks['esp32_set_pin_off'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Set Pin');
    this.appendValueInput('PIN')
      .setCheck('Pin');
    this.appendDummyInput()
      .appendField('OFF');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(15);
    this.setTooltip('Set a digital pin LOW (0V).');
  },
};

javascriptGenerator.forBlock['esp32_set_pin_off'] = function (block) {
  const pin = javascriptGenerator.valueToCode(block, 'PIN', Order.ATOMIC) || '2';

  return `
    {
      var pinTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/digital_write',
        messageType: 'std_msgs/msg/Int32'
      });
      pinTopic.publish(new ROSLIB.Message({ data: ((${pin} << 8) | 0) }));
      log('Pin G' + ${pin} + ' -> OFF');
    }
  `;
};
