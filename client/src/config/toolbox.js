import { commonCategory } from './categories/common';
import { vehicleCategory } from './categories/vehicle';

export const toolbox = `
<xml xmlns="https://developers.google.com/blockly/xml">
  ${commonCategory}
  ${vehicleCategory}
</xml>
`;
