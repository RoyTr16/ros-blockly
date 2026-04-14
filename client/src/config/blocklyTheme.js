import * as Blockly from 'blockly/core';

// Custom dark theme for Blockly workspace
export const darkTheme = Blockly.Theme.defineTheme('rosBlocklyDark', {
  name: 'rosBlocklyDark',
  base: Blockly.Themes.Classic,
  blockStyles: {
    logic_blocks: { colourPrimary: '#6366f1', colourSecondary: '#4f46e5', colourTertiary: '#3730a3' },
    loop_blocks: { colourPrimary: '#059669', colourSecondary: '#047857', colourTertiary: '#065f46' },
    math_blocks: { colourPrimary: '#4f8cff', colourSecondary: '#3b7bef', colourTertiary: '#2563eb' },
    text_blocks: { colourPrimary: '#10b981', colourSecondary: '#059669', colourTertiary: '#047857' },
    list_blocks: { colourPrimary: '#8b5cf6', colourSecondary: '#7c3aed', colourTertiary: '#6d28d9' },
    variable_blocks: { colourPrimary: '#f59e0b', colourSecondary: '#d97706', colourTertiary: '#b45309' },
    procedure_blocks: { colourPrimary: '#ec4899', colourSecondary: '#db2777', colourTertiary: '#be185d' },
  },
  categoryStyles: {
    logic_category: { colour: '#6366f1' },
    loop_category: { colour: '#059669' },
    math_category: { colour: '#4f8cff' },
    text_category: { colour: '#10b981' },
    list_category: { colour: '#8b5cf6' },
    variable_category: { colour: '#f59e0b' },
    procedure_category: { colour: '#ec4899' },
  },
  componentStyles: {
    workspaceBackgroundColour: '#13151f',
    toolboxBackgroundColour: '#1a1d2e',
    toolboxForegroundColour: '#e8eaf0',
    flyoutBackgroundColour: '#1e2235',
    flyoutForegroundColour: '#e8eaf0',
    flyoutOpacity: 0.95,
    scrollbarColour: '#3a3f5c',
    scrollbarOpacity: 0.7,
    insertionMarkerColour: '#4f8cff',
    insertionMarkerOpacity: 0.4,
    cursorColour: '#4f8cff',
  },
  fontStyle: {
    family: "'Inter', system-ui, sans-serif",
    weight: '500',
    size: 11,
  },
  startHats: false,
});
