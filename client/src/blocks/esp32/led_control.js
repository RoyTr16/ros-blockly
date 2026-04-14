import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';

// Predefined color options [label, hex-without-hash]
const COLOR_OPTIONS = [
  ['🔴 Red', 'FF0000'],
  ['🟢 Green', '00FF00'],
  ['🔵 Blue', '0000FF'],
  ['🟡 Yellow', 'FFFF00'],
  ['🟣 Purple', '800080'],
  ['🟠 Orange', 'FFA500'],
  ['⚪ White', 'FFFFFF'],
  ['🩵 Cyan', '00FFFF'],
];

// --- LED On (with color dropdown) ---
Blockly.Blocks['esp32_led_on'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('ESP32 LED')
      .appendField(new Blockly.FieldDropdown(COLOR_OPTIONS), 'COLOUR');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(15);
    this.setTooltip('Turn the ESP32 on-board RGB LED to the chosen color.');
  },
};

javascriptGenerator.forBlock['esp32_led_on'] = function (block) {
  const hex = block.getFieldValue('COLOUR');
  const colorInt = parseInt(hex, 16);

  return `
    {
      var ledTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/led',
        messageType: 'std_msgs/msg/Int32'
      });
      ledTopic.publish(new ROSLIB.Message({ data: ${colorInt} }));
      log('ESP32 LED -> #${hex}');
    }
  `;
};

// --- LED Off ---
Blockly.Blocks['esp32_led_off'] = {
  init: function () {
    this.appendDummyInput().appendField('ESP32 LED Off');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(15);
    this.setTooltip('Turn the ESP32 on-board RGB LED off.');
  },
};

javascriptGenerator.forBlock['esp32_led_off'] = function () {
  return `
    {
      var ledTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/led',
        messageType: 'std_msgs/msg/Int32'
      });
      ledTopic.publish(new ROSLIB.Message({ data: 0 }));
      log('ESP32 LED -> OFF');
    }
  `;
};
