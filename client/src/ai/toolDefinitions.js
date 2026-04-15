// Tool definitions for Gemini function calling
// These are sent to the model so it can call our tools instead of generating raw JSON.

import { getLoadedPackages } from '../packages/PackageLoader';

// Build the tool declarations dynamically based on loaded packages
export function buildToolDeclarations() {
  const blockTypes = [];
  const packages = getLoadedPackages();

  for (const entry of Object.values(packages)) {
    for (const block of entry.pkg.blocks) {
      blockTypes.push(block.type);
    }
  }

  return [
    {
      name: 'create_program',
      description: `Create a new Blockly program from scratch. The program is described as an array of block chains. Each chain is an array of blocks executed sequentially. Available custom block types: ${blockTypes.join(', ')}. Also available: standard Blockly blocks (controls_repeat_ext, controls_for, controls_whileUntil, controls_if, forever, variables_set, variables_get, logic_compare, logic_operation, math_arithmetic, math_number, logic_boolean, math_modulo, wait_seconds, utilities_print, utilities_elapsed_time, procedures_defnoreturn, procedures_defreturn, procedures_callnoreturn, procedures_callreturn, controls_flow_statements).`,
      parameters: {
        type: 'OBJECT',
        properties: {
          blocks: {
            type: 'STRING',
            description: 'A JSON string encoding the blocks array. Must be valid JSON. The top level is an array of chains. Each chain is an array of block objects executed sequentially. Example: [[{"type":"wait_seconds","seconds":1}]]. See the system instructions for the full block reference.',
          },
        },
        required: ['blocks'],
      },
    },
    {
      name: 'modify_program',
      description: 'Apply targeted modifications to the current program without regenerating the entire workspace. Use this for small changes like adjusting values, adding/removing blocks, etc.',
      parameters: {
        type: 'OBJECT',
        properties: {
          operations: {
            type: 'STRING',
            description: 'A JSON string encoding an array of modification operations. Each operation is an object with: action ("set_field"|"set_input"|"remove_block"|"add_after"), block_type (target block type), and action-specific fields (field/value for set_field, input/value for set_input, occurrence for targeting specific instances, blocks array for add_after). Example: [{"action":"set_field","block_type":"wait_seconds","field":"SECONDS","value":"2"}]',
          },
        },
        required: ['operations'],
      },
    },
  ];
}
