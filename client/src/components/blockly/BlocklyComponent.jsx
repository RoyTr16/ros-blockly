
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import 'blockly/blocks'; // Import standard blocks (math, logic, etc.)
import '../../blocks/utilities/utilities'; // Core blocks (not a package)
import { saveFunction, exportFunction } from '../../functions/FunctionLibrary';

import * as En from 'blockly/msg/en';
Blockly.setLocale(En);

import { toolbox, buildToolbox } from '../../config/toolbox';
import { registerPackage } from '../../packages/PackageLoader';
import { darkTheme } from '../../config/blocklyTheme';

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
      theme: darkTheme,
      renderer: 'zelos',
      ...rest,
    });

    // Register context menu items for function save/export (guard against duplicates on HMR)
    const isProcedureDef = (scope) => {
      const block = scope.block;
      return block && (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn');
    };

    const registry = Blockly.ContextMenuRegistry.registry;

    if (!registry.getItem('save_function_to_library')) {
      registry.register({
        id: 'save_function_to_library',
        weight: 200,
        displayText: () => 'Save to Function Library',
        preconditionFn: (scope) => isProcedureDef(scope) ? 'enabled' : 'hidden',
        callback: (scope) => {
          saveFunction(workspace.current, scope.block.id);
          window.dispatchEvent(new Event('functionLibraryChanged'));
        },
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      });
    }

    if (!registry.getItem('export_function_file')) {
      registry.register({
        id: 'export_function_file',
        weight: 201,
        displayText: () => 'Export as .func.json',
        preconditionFn: (scope) => isProcedureDef(scope) ? 'enabled' : 'hidden',
        callback: (scope) => {
          exportFunction(workspace.current, scope.block.id);
        },
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      });
    }

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
        // Generate full code for display panel
        const code = javascriptGenerator.workspaceToCode(workspace.current);

        // Generate per-group code for concurrent execution
        // We must re-init the generator because workspaceToCode() deletes nameDB_ and definitions_
        // This gives us a fresh, consistent name database for all groups
        javascriptGenerator.init(workspace.current);
        const topBlocks = workspace.current.getTopBlocks(true);
        const codeGroups = [];
        for (const block of topBlocks) {
          // Skip blocks with output (expression blocks) or no connections (standalone visual blocks)
          if (block.outputConnection) continue;
          if (!block.previousConnection && !block.nextConnection) continue;
          const groupCode = javascriptGenerator.blockToCode(block);
          if (typeof groupCode === 'string' && groupCode.trim()) {
            codeGroups.push(groupCode);
          } else if (Array.isArray(groupCode) && groupCode[0]?.trim()) {
            codeGroups.push(groupCode[0]);
          }
        }
        // Read definitions_ (variable declarations, function defs) BEFORE finish() deletes them
        const preamble = Object.values(javascriptGenerator.definitions_ || {}).join('\n\n');

        console.log(`[BlocklyComponent] Top blocks: ${topBlocks.length}, Code groups: ${codeGroups.length}, Preamble: ${preamble.length} chars`);
        props.onCodeChange(code, codeGroups, preamble);
        try {
          const state = Blockly.serialization.workspaces.save(workspace.current);
          localStorage.setItem('blockly_autosave', JSON.stringify(state));
        } catch (e) {
          // ignore serialization errors
        }
    });

    // Resize Blockly when container size changes (e.g. panel open/close)
    const resizeObserver = new ResizeObserver(() => {
      if (workspace.current) {
        Blockly.svgResize(workspace.current);
      }
    });
    resizeObserver.observe(blocklyDiv.current);

    return () => {
        resizeObserver.disconnect();
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
