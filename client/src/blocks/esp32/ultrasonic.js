import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

// All usable GPIO pins on ESP32 / ESP32-S3
const GPIO_OPTIONS = [
  ['G2', '2'], ['G4', '4'], ['G5', '5'],
  ['G12', '12'], ['G13', '13'], ['G14', '14'], ['G15', '15'],
  ['G16', '16'], ['G17', '17'], ['G18', '18'], ['G19', '19'],
  ['G21', '21'], ['G22', '22'], ['G23', '23'],
  ['G25', '25'], ['G26', '26'], ['G27', '27'],
  ['G32', '32'], ['G33', '33'],
];

// --- GPIO Pin (generic value block) ---
Blockly.Blocks['esp32_gpio_pin'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(GPIO_OPTIONS), 'PIN');
    this.setOutput(true, 'Pin');
    this.setColour(180);
    this.setTooltip('Select a GPIO pin.');
  },
};

javascriptGenerator.forBlock['esp32_gpio_pin'] = function (block) {
  const pin = block.getFieldValue('PIN');
  return [pin, Order.ATOMIC];
};

// --- Setup Ultrasonic Sensor ---
Blockly.Blocks['esp32_setup_ultrasonic'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Setup Ultrasonic Sensor')
      .appendField('→')
      .appendField(new Blockly.FieldVariable('distance'), 'VAR');
    this.appendValueInput('TRIG_PIN')
      .setCheck('Pin')
      .appendField('Trigger Pin');
    this.appendValueInput('ECHO_PIN')
      .setCheck('Pin')
      .appendField('Echo Pin');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(15);
    this.setTooltip('Configure HC-SR04 sensor. Distance readings (cm) are stored in the chosen variable.');
  },
};

javascriptGenerator.forBlock['esp32_setup_ultrasonic'] = function (block) {
  const trigPin = javascriptGenerator.valueToCode(block, 'TRIG_PIN', Order.ATOMIC) || '17';
  const echoPin = javascriptGenerator.valueToCode(block, 'ECHO_PIN', Order.ATOMIC) || '16';
  const varName = javascriptGenerator.getVariableName(block.getFieldValue('VAR'));
  const packed = `((${trigPin} << 8) | ${echoPin})`;

  return `
    {
      ${varName} = 0;

      // Send pin configuration to ESP32
      var configTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/ultrasonic_config',
        messageType: 'std_msgs/msg/Int32'
      });
      configTopic.publish(new ROSLIB.Message({ data: ${packed} }));
      log('Ultrasonic sensor: trig=G' + ${trigPin} + ', echo=G' + ${echoPin});

      // Subscribe to distance readings → update variable
      if (!window.rosBlockly) window.rosBlockly = {};
      if (window.rosBlockly.ultrasonicSub) {
        window.rosBlockly.ultrasonicSub.unsubscribe();
      }
      window.rosBlockly.ultrasonicSub = new ROSLIB.Topic({
        ros: ros,
        name: '/esp32/ultrasonic',
        messageType: 'std_msgs/msg/Float32'
      });
      window.rosBlockly.ultrasonicSub.subscribe(function(msg) {
        if (msg.data >= 0) {
          ${varName} = msg.data;
        }
      });

      // Wait for ESP32 to configure pins before reading
      await wait(0.5);
    }
  `;
};
