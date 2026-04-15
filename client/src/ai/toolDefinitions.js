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
            type: 'ARRAY',
            description: 'Array of block chains. Each chain is an array of block objects to be executed sequentially. Multiple chains create separate stacks (e.g., function definitions separate from main code).',
            items: {
              type: 'ARRAY',
              description: 'A sequential chain of blocks.',
              items: {
                type: 'OBJECT',
                description: 'A block descriptor. Each block has a "type" and type-specific properties. See the system instructions for the full block reference.',
              },
            },
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
            type: 'ARRAY',
            description: 'Array of modification operations to apply in order.',
            items: {
              type: 'OBJECT',
              description: 'A modification operation.',
              properties: {
                action: {
                  type: 'STRING',
                  description: 'The type of modification: "set_field" to change a field value, "set_input" to change a value input, "remove_block" to delete a block, "add_after" to insert blocks after a target.',
                  enum: ['set_field', 'set_input', 'remove_block', 'add_after'],
                },
                block_type: {
                  type: 'STRING',
                  description: 'The type of the target block to modify.',
                },
                field: {
                  type: 'STRING',
                  description: 'For set_field: the name of the field to change (e.g., "SECONDS", "COLOR", "NUM").',
                },
                value: {
                  type: 'STRING',
                  description: 'For set_field/set_input: the new value (as string).',
                },
                input: {
                  type: 'STRING',
                  description: 'For set_input: the input name to change.',
                },
                occurrence: {
                  type: 'INTEGER',
                  description: 'Which occurrence (0-indexed) of the block type to target. Defaults to 0 (first).',
                },
                blocks: {
                  type: 'ARRAY',
                  description: 'For add_after: the DSL blocks to insert.',
                  items: { type: 'OBJECT' },
                },
              },
              required: ['action', 'block_type'],
            },
          },
        },
        required: ['operations'],
      },
    },
  ];
}
