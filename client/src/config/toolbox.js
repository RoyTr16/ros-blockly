import { logicCategory } from './categories/logic';
import { loopsCategory } from './categories/loops';
import { mathCategory } from './categories/math';
import { variablesCategory } from './categories/variables';
import { commonCategory } from './categories/common';
import { vehicleCategory } from './categories/vehicle';
import { ur5Category } from './categories/ur5';
import { esp32Category } from './categories/esp32';
import { utilitiesCategory } from './categories/utilities';

// Export the full toolbox XML
export const toolbox = `
<xml xmlns="https://developers.google.com/blockly/xml">
  ${logicCategory}
  ${loopsCategory}
  ${mathCategory}
  ${variablesCategory}
  ${utilitiesCategory}
  <sep></sep>
  <category name="ROS" colour="60">
    <category name="Common" colour="60">
      ${commonCategory.replace('<category name="Common" colour="120">', '').replace('</category>', '')}
    </category>
    ${vehicleCategory}
    ${ur5Category}
    ${esp32Category}
  </category>
</xml>
`;
