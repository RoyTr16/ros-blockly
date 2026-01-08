import { commonCategory } from './categories/common';
import { vehicleCategory } from './categories/vehicle';
import { ur5Category } from './categories/ur5';

export const toolbox = `
<xml xmlns="https://developers.google.com/blockly/xml">
  ${commonCategory}
  ${vehicleCategory}
  ${ur5Category}
</xml>
`;
