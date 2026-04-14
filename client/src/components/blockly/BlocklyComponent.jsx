
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import 'blockly/blocks'; // Import standard blocks (math, logic, etc.)
import '../../blocks/utilities/utilities'; // Core blocks (not a package)

import * as En from 'blockly/msg/en';
Blockly.setLocale(En);

import { toolbox, buildToolbox } from '../../config/toolbox';
import { registerPackage } from '../../packages/PackageLoader';

const BlocklyComponent = forwardRef((props, ref) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);

  useImperativeHandle(ref, () => ({
    getWorkspace: () => workspace.current,
    importPackage: (pkg) => {
      registerPackage(pkg);
      if (workspace.current) {
        workspace.current.updateToolbox(buildToolbox());
      }
    },
    save: () => {
      if (!workspace.current) return;
      const state = Blockly.serialization.workspaces.save(workspace.current);
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'blockly_program.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    load: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const state = JSON.parse(ev.target.result);
            if (workspace.current) {
              Blockly.serialization.workspaces.load(state, workspace.current);
            }
          } catch (err) {
            alert('Failed to load file: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    },
  }));

  useEffect(() => {
    const { initialXml, children, ...rest } = props;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      ...rest,
    });

    if (initialXml) {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(initialXml), workspace.current);
    }

    // Restore from localStorage
    try {
      const saved = localStorage.getItem('blockly_autosave');
      if (saved) {
        const state = JSON.parse(saved);
        Blockly.serialization.workspaces.load(state, workspace.current);
      }
    } catch (e) {
      console.warn('Failed to restore autosave:', e);
    }

    // Listener to generate code on change + autosave
    workspace.current.addChangeListener(() => {
        const code = javascriptGenerator.workspaceToCode(workspace.current);
        props.onCodeChange(code);
        try {
          const state = Blockly.serialization.workspaces.save(workspace.current);
          localStorage.setItem('blockly_autosave', JSON.stringify(state));
        } catch (e) {
          // ignore serialization errors
        }
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
});

export default BlocklyComponent;
