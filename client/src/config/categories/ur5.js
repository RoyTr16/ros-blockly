export const ur5Category = `
<category name="UR5" colour="230">
  <block type="ur5_move_joints">
    <value name="DURATION">
      <shadow type="math_number">
        <field name="NUM">2</field>
      </shadow>
    </value>
    <value name="ur5_rg2::shoulder_pan_joint"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    <value name="ur5_rg2::shoulder_lift_joint"><shadow type="math_number"><field name="NUM">-1.57</field></shadow></value>
    <value name="ur5_rg2::elbow_joint"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    <value name="ur5_rg2::wrist_1_joint"><shadow type="math_number"><field name="NUM">-1.57</field></shadow></value>
    <value name="ur5_rg2::wrist_2_joint"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    <value name="ur5_rg2::wrist_3_joint"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
  </block>
  <block type="ur5_move_single_joint">
    <value name="POSITION">
      <shadow type="math_number">
        <field name="NUM">0</field>
      </shadow>
    </value>
  </block>
</category>
`;
