import { logicCategory } from './categories/logic';
import { loopsCategory } from './categories/loops';
import { mathCategory } from './categories/math';
import { variablesCategory } from './categories/variables';
import { utilitiesCategory } from './categories/utilities';
import { registerPackage, getAllPackageToolboxXml } from '../packages/PackageLoader';

// Import and register built-in packages
import esp32Package from '../packages/builtin/esp32.json';
import vehiclePackage from '../packages/builtin/vehicle.json';
import ur5Package from '../packages/builtin/ur5.json';

registerPackage(esp32Package);
registerPackage(vehiclePackage);
registerPackage(ur5Package);

// Build toolbox XML from core categories + loaded packages
export function buildToolbox() {
  return `
<xml xmlns="https://developers.google.com/blockly/xml">
  ${logicCategory}
  ${loopsCategory}
  ${mathCategory}
  ${variablesCategory}
  ${utilitiesCategory}
  <sep></sep>
  ${getAllPackageToolboxXml()}
</xml>`;
}

export const toolbox = buildToolbox();
