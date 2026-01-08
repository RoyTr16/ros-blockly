export const toolbox = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <category name="Common" colour="120">
    <block type="ros_publish_twist">
      <value name="LINEAR">
        <shadow type="math_number">
          <field name="NUM">0.5</field>
        </shadow>
      </value>
      <value name="ANGULAR">
        <shadow type="math_number">
          <field name="NUM">0</field>
        </shadow>
      </value>
    </block>
  </category>
  <category name="Vehicle" colour="230">
    <block type="move_robot"></block>
    <block type="stop_robot"></block>
  </category>
</xml>
`;
