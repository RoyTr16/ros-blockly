// PackageLoader: registers Blockly blocks and generators from JSON package definitions.
//
// Template syntax in generator code:
//   {{$FIELD}}  → block.getFieldValue('FIELD')  (raw value, inserted as-is)
//   {{INPUT}}   → valueToCode(block, 'INPUT', Order[spec.order])  (value input)
//   {{%VAR}}    → getVariableName(block.getFieldValue('VAR'))  (variable for codegen)

import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';

const ORDER_MAP = {
  ATOMIC: Order.ATOMIC,
  NONE: Order.NONE,
  MEMBER: Order.MEMBER,
  ADDITION: Order.ADDITION,
  DIVISION: Order.DIVISION,
  MULTIPLICATION: Order.MULTIPLICATION,
};

const loadedPackages = {};

function buildGenerator(generatorSpec) {
  const { type, template, inputs = {}, order } = generatorSpec;

  return function (block) {
    let code = template;

    // Replace {{%VAR_FIELD}} → variable name for codegen
    code = code.replace(/\{\{%(\w+)\}\}/g, (_, name) => {
      return javascriptGenerator.getVariableName(block.getFieldValue(name));
    });

    // Replace {{$FIELD}} → raw field value
    code = code.replace(/\{\{\$(\w+)\}\}/g, (_, name) => {
      return block.getFieldValue(name);
    });

    // Replace {{INPUT}} → valueToCode
    code = code.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      if (inputs[name]) {
        const inputOrder = ORDER_MAP[inputs[name].order] ?? Order.NONE;
        return javascriptGenerator.valueToCode(block, name, inputOrder) || inputs[name].default || '0';
      }
      return '';
    });

    if (type === 'reporter') {
      return [code, ORDER_MAP[order] ?? Order.NONE];
    }
    return code;
  };
}

function buildToolboxXml(category) {
  let xml = '';

  function blockToXml(b) {
    let inner = '';
    if (b.fields) {
      for (const [name, value] of Object.entries(b.fields)) {
        inner += `<field name="${name}">${value}</field>`;
      }
    }
    if (b.shadows) {
      for (const [inputName, shadow] of Object.entries(b.shadows)) {
        let shadowInner = '';
        if (shadow.fields) {
          for (const [fn, fv] of Object.entries(shadow.fields)) {
            shadowInner += `<field name="${fn}">${fv}</field>`;
          }
        }
        inner += `<value name="${inputName}"><block type="${shadow.type}">${shadowInner}</block></value>`;
      }
    }
    return `<block type="${b.type}">${inner}</block>`;
  }

  function categoryToXml(cat) {
    let content = '';
    if (cat.blocks) {
      content += cat.blocks.map(blockToXml).join('\n');
    }
    if (cat.subcategories) {
      content += cat.subcategories.map(categoryToXml).join('\n');
    }
    return `<category name="${cat.name}" colour="${cat.colour || 230}">${content}</category>`;
  }

  return categoryToXml(category);
}

export function registerPackage(pkg) {
  if (loadedPackages[pkg.id]) {
    unregisterPackage(pkg.id);
  }

  // Register blocks
  for (const blockDef of pkg.blocks) {
    Blockly.Blocks[blockDef.type] = {
      init: function () {
        this.jsonInit(blockDef.definition);
      },
    };

    if (blockDef.generator) {
      javascriptGenerator.forBlock[blockDef.type] = buildGenerator(blockDef.generator);
    }
  }

  // Build toolbox XML
  const toolboxXml = buildToolboxXml(pkg.category);

  loadedPackages[pkg.id] = {
    pkg,
    toolboxXml,
    reset: pkg.reset || [],
  };

  return toolboxXml;
}

export function unregisterPackage(id) {
  const entry = loadedPackages[id];
  if (!entry) return;

  for (const blockDef of entry.pkg.blocks) {
    delete Blockly.Blocks[blockDef.type];
    delete javascriptGenerator.forBlock[blockDef.type];
  }

  delete loadedPackages[id];
}

export function getLoadedPackages() {
  return { ...loadedPackages };
}

export function getAllPackageToolboxXml() {
  return Object.values(loadedPackages)
    .map(entry => entry.toolboxXml)
    .join('\n');
}

export function getAllResetActions() {
  return Object.values(loadedPackages).flatMap(entry => entry.reset);
}
