
import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import 'blockly/blocks'; // Import standard blocks (math, logic, etc.)
import '../../blocks/common/publish_twist';
import '../../blocks/common/wait'; // Import wait block
import '../../blocks/vehicle/simple_movement';
import '../../blocks/ur5/joint_control';
import '../../blocks/ur5/single_joint_control';
import '../../blocks/esp32/led_control';

import * as En from 'blockly/msg/en';
Blockly.setLocale(En);

import { toolbox } from '../../config/toolbox';

const BlocklyComponent = (props) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);

  useEffect(() => {
    const { initialXml, children, ...rest } = props;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      ...rest,
    });

    if (initialXml) {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(initialXml), workspace.current);
    }

    // Listener to generate code on change
    workspace.current.addChangeListener(() => {
        const code = javascriptGenerator.workspaceToCode(workspace.current);
        props.onCodeChange(code);
    });

    return () => {
        if (workspace.current) {
            workspace.current.dispose();
        }
    };
  }, [props.initialXml]);

  return (
    <div ref={blocklyDiv} style={{ height: '100%', width: '100%' }} />
  );
};

export default BlocklyComponent;
