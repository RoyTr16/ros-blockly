import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import 'blockly/blocks';
import '../../blocks/ros_blocks'; // Import custom blocks

import * as En from 'blockly/msg/en';
Blockly.setLocale(En);

const BlocklyComponent = (props) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);

  useEffect(() => {
    const { initialXml, children, ...rest } = props;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: `
        <xml xmlns="https://developers.google.com/blockly/xml">
          <block type="move_robot"></block>
          <block type="stop_robot"></block>
        </xml>
      `,
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
