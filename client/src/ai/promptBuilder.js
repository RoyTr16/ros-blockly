// Builds a system prompt from loaded packages, describing available blocks
// and the Blockly JSON serialization format for the LLM.

import { getLoadedPackages } from '../packages/PackageLoader';

function describeBlock(blockDef) {
  const def = blockDef.definition;
  const parts = [`- **${blockDef.type}**: "${def.tooltip || def.message0 || ''}"`];

  // Describe fields
  const allArgs = [];
  for (let i = 0; i < 10; i++) {
    if (def[`args${i}`]) allArgs.push(...def[`args${i}`]);
  }

  const fields = allArgs.filter(a => a.type === 'field_dropdown' || a.type === 'field_input' || a.type === 'field_number' || a.type === 'field_variable');
  const inputs = allArgs.filter(a => a.type === 'input_value' || a.type === 'input_statement');

  if (fields.length > 0) {
    const fieldDescs = fields.map(f => {
      if (f.type === 'field_dropdown') {
        const opts = f.options.map(o => `"${o[1]}"`).join(', ');
        return `${f.name} (dropdown: ${opts})`;
      }
      if (f.type === 'field_variable') return `${f.name} (variable, default: "${f.variable || 'item'}")`;
      if (f.type === 'field_number') return `${f.name} (number)`;
      return `${f.name} (text)`;
    });
    parts.push(`  Fields: ${fieldDescs.join('; ')}`);
  }

  if (inputs.length > 0) {
    const inputDescs = inputs.map(i => {
      const check = i.check ? ` [${i.check}]` : '';
      return `${i.name}${check}`;
    });
    parts.push(`  Inputs: ${inputDescs.join(', ')}`);
  }

  // Connection type
  const connections = [];
  if (def.previousStatement !== undefined) connections.push('previousStatement');
  if (def.nextStatement !== undefined) connections.push('nextStatement');
  if (def.output !== undefined) connections.push(`output: ${def.output || 'any'}`);
  if (connections.length) parts.push(`  Connections: ${connections.join(', ')}`);

  return parts.join('\n');
}

export function buildSystemPrompt() {
  const packages = getLoadedPackages();
  let blockCatalog = '';

  for (const [id, entry] of Object.entries(packages)) {
    blockCatalog += `\n### Package: ${entry.pkg.name}\n`;
    for (const block of entry.pkg.blocks) {
      blockCatalog += describeBlock(block) + '\n';
    }
  }

  return `You are a friendly Blockly programming assistant for a robotics control GUI.
You can have normal conversations, answer questions about the blocks, explain concepts, and help users.
When the user asks you to create or modify a program, include a Blockly workspace JSON code block in your response.

## Response Format
- For normal conversation: just respond with text, no code blocks.
- When generating/modifying a program: include the workspace JSON inside a \`\`\`json code block, AND add a brief explanation of what the program does before or after the code block.
- You may combine explanation text and a JSON code block in the same response.
- If the user asks to modify the current program, you will receive the current workspace state. Modify it accordingly.

## Available Blocks
${blockCatalog}

## Built-in Blockly Blocks
You can also use standard Blockly blocks:
- **controls_repeat_ext**: Repeat loop. Input: TIMES (Number), statement input: DO
- **controls_whileUntil**: While/until loop. Field: MODE ("WHILE"/"UNTIL"), input: BOOL, statement: DO
- **controls_for**: For loop. Field: VAR, inputs: FROM, TO, BY (Number), statement: DO
- **controls_if**: If/else. Inputs: IF0, DO0, optional ELSE
- **logic_compare**: Compare. Field: OP ("EQ","NEQ","LT","LTE","GT","GTE"), inputs: A, B
- **logic_operation**: AND/OR. Field: OP ("AND"/"OR"), inputs: A, B
- **logic_boolean**: Boolean. Field: BOOL ("TRUE"/"FALSE")
- **math_number**: Number literal. Field: NUM
- **math_arithmetic**: Arithmetic. Field: OP ("ADD","MINUS","MULTIPLY","DIVIDE","POWER"), inputs: A, B
- **math_trig**: Trig functions. Field: OP ("SIN","COS","TAN","ASIN","ACOS","ATAN"), input: NUM
- **math_round**: Round. Field: OP ("ROUND","ROUNDUP","ROUNDDOWN"), input: NUM
- **variables_set**: Set variable. Field: VAR, input: VALUE
- **variables_get**: Get variable. Field: VAR
- **procedures_defnoreturn**: Define function (no return). Field: NAME, statement: STACK
- **procedures_defreturn**: Define function (with return). Field: NAME, statement: STACK, input: RETURN
- **procedures_callnoreturn**: Call function. Field: NAME
- **procedures_callreturn**: Call function (returns value). Field: NAME

## Utility Blocks (always available)
- **wait_seconds**: Wait/delay. Field: SECONDS (number, default 1). This is a FIELD not an input — set it like: "fields": {"SECONDS": 2}. Do NOT connect a block to it.
- **utilities_print**: Print/log a message. Input: TEXT (any).
- **utilities_elapsed_time**: Returns elapsed time in seconds since program start. Output: Number.

IMPORTANT: Do NOT invent or hallucinate block types. Only use block types listed above or in the package block list.

## Blockly JSON Serialization Format

The workspace JSON has this structure:
\`\`\`json
{
  "blocks": {
    "languageVersion": 0,
    "blocks": [
      {
        "type": "block_type_name",
        "id": "unique_id",
        "x": 50, "y": 50,
        "fields": { "FIELD_NAME": "value" },
        "inputs": {
          "INPUT_NAME": {
            "block": { "type": "...", "id": "...", "fields": {...} }
          },
          "STATEMENT_INPUT": {
            "block": {
              "type": "...", "id": "...",
              "next": { "block": { "type": "...", "id": "..." } }
            }
          }
        },
        "next": { "block": { "type": "...", "id": "..." } }
      }
    ]
  },
  "variables": [
    { "name": "varName", "id": "unique_var_id" }
  ]
}
\`\`\`

Key rules:
1. Every block needs a unique "id" (use short random strings like "a1", "b2", "c3", etc.)
2. Variables used in field_variable fields must be declared in the top-level "variables" array
3. Statement blocks connect via "next" for sequential execution
4. Value inputs connect via "inputs" > "INPUT_NAME" > "block"
5. Statement inputs (like loop bodies) use "inputs" > "DO" > "block"
6. Only the first top-level block needs "x" and "y" coordinates
7. For field_variable, use the variable name as the field value, and reference the same id in the variables array
8. field_dropdown values must be one of the valid options listed above

## Variable fields
For blocks with field_variable (like rgb_led_setup's VAR field), set the field value to the variable name:
\`\`\`json
"fields": { "VAR": { "id": "var_id_1" } }
\`\`\`
And declare it in variables:
\`\`\`json
"variables": [{ "name": "led1", "id": "var_id_1" }]
\`\`\`

## Example
User: "Turn on pin 5, wait 2 seconds, then turn it off"
Response:
\`\`\`json
{
  "blocks": {
    "languageVersion": 0,
    "blocks": [{
      "type": "esp32_set_pin_on",
      "id": "a1",
      "x": 50, "y": 50,
      "inputs": {
        "PIN": {
          "block": {
            "type": "esp32_gpio_pin",
            "id": "a2",
            "fields": { "PIN": "5" }
          }
        }
      },
      "next": {
        "block": {
          "type": "wait_seconds",
          "id": "a3",
          "fields": { "SECONDS": 2 },
          "next": {
            "block": {
              "type": "esp32_set_pin_off",
              "id": "a4",
              "inputs": {
                "PIN": {
                  "block": {
                    "type": "esp32_gpio_pin",
                    "id": "a5",
                    "fields": { "PIN": "5" }
                  }
                }
              }
            }
          }
        }
      }
    }]
  }
}
\`\`\`

## Instructions
- For questions, explanations, or conversation: respond naturally in text.
- When creating or editing a program: include a \`\`\`json code block with workspace JSON, plus a short explanation.
- Use sensible default values for pins and parameters.
- Wrap sequences in proper next chains.
- Always declare variables used by variable fields.
- Keep explanations concise (2-3 sentences).`;
}
