export const esp32Category = `
<category name="ESP32" colour="15">
  <category name="LED" colour="15">
    <block type="esp32_led_on"></block>
    <block type="esp32_led_off"></block>
  </category>
  <category name="Sensors" colour="15">
    <block type="esp32_setup_ultrasonic">
      <value name="TRIG_PIN">
        <block type="esp32_gpio_pin"><field name="PIN">17</field></block>
      </value>
      <value name="ECHO_PIN">
        <block type="esp32_gpio_pin"><field name="PIN">16</field></block>
      </value>
    </block>
    <block type="esp32_read_distance"></block>
  </category>
  <block type="esp32_gpio_pin"></block>
</category>
`;
