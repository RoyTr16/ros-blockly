// Tool definitions for Gemini function calling
// These are sent to the model so it can call our tools instead of generating raw JSON.

import { getLoadedPackages } from '../packages/PackageLoader';
import { getAllBlockTypes } from './promptBuilder';

// Build the tool declarations dynamically based on loaded packages
export function buildToolDeclarations() {
  const allTypes = getAllBlockTypes();

  return [
    {
      name: 'get_block_details',
      description: 'Get the exact DSL syntax for specific block types before creating a program. Call this first to learn the fields and inputs for blocks you plan to use.',
      parameters: {
        type: 'OBJECT',
        properties: {
          block_types: {
            type: 'STRING',
            description: `A JSON array of block type names to get syntax for. Available types: ${allTypes.join(', ')}. Example: '["esp32_set_pin_on", "esp32_setup_ultrasonic"]'`,
          },
        },
        required: ['block_types'],
      },
    },
    {
      name: 'create_program',
      description: 'Create a new Blockly program from scratch. The program is described as an array of block chains. Call get_block_details first if you need DSL syntax for hardware blocks.',
      parameters: {
        type: 'OBJECT',
        properties: {
          blocks: {
            type: 'STRING',
            description: 'A JSON string encoding the blocks array. Top level is an array of chains. Each chain is an array of block objects. See system instructions for format.',
          },
        },
        required: ['blocks'],
      },
    },
    {
      name: 'modify_program',
      description: 'Apply targeted modifications to the current program without regenerating the entire workspace. Use this for small changes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          operations: {
            type: 'STRING',
            description: 'A JSON string encoding an array of modification operations. Each operation has: action ("set_field"|"set_input"|"remove_block"|"add_after"), block_type, and action-specific fields.',
          },
        },
        required: ['operations'],
      },
    },
  ];
}
