# Block Implementation Strategy

This document outlines how ROS-enabled blocks are defined and loaded in the Blockly interface using the **JSON Package System**.

## 1. Goals
*   **Scalability**: Add support for new robots or hardware by dropping in a single JSON file — no JavaScript authoring required.
*   **Maintainability**: Block UI definitions and code generators live together in one self-contained package file.
*   **Genericism**: Packages can define any combination of blocks, generators, reset actions, toolbox categories, and AI hints.

## 2. Architecture

### A. JSON Package System (`client/src/packages/`)

All robot/hardware blocks are defined declaratively in JSON files and loaded at startup by `PackageLoader.js`.

**Built-in packages** (`packages/builtin/`):
*   `vehicle.json` — Differential-drive vehicle control (Move Robot, Stop Robot, Publish Twist).
*   `ur5.json` — UR5 robotic arm single-joint position control.
*   `esp32.json` — ESP32 GPIO, ultrasonic sensors, RGB LEDs via micro-ROS.

Each package JSON file contains:
```json
{
  "id": "vehicle",
  "name": "Vehicle Control",
  "version": "1.0.0",
  "description": "...",
  "ai": { "subcategory_hints": { ... } },
  "blocks": [ ... ],
  "reset": [ ... ],
  "category": { ... }
}
```

**`blocks`**: Array of block definitions, each containing:
*   `type`: Unique block ID (e.g., `move_robot`, `ur5_move_single_joint`).
*   `definition`: Standard Blockly JSON block definition (`message0`, `args0`, etc.).
*   `generator`: Code generation spec with a `template` string and input mappings.
*   `ai_description`: Natural-language description used by the AI chat to understand the block.

**`reset`**: Array of actions executed when the user clicks "Reset". Each action publishes to a topic or calls a service.

**`category`**: Defines the toolbox category (name, colour, blocks list) that appears in the Blockly sidebar.

### B. Template Syntax (Code Generation)

Instead of writing JavaScript generator functions, package authors write code **templates** with placeholder syntax:

| Syntax | Meaning | Example |
|---|---|---|
| `{{$FIELD}}` | Raw field value (inserted as-is) | `{{$LINEAR_X}}` → `0.5` |
| `{{INPUT}}` | Value input (via `valueToCode`) | `{{POSITION}}` → evaluated expression |
| `{{%VAR}}` | Variable name (for codegen) | `{{%VAR}}` → `distance` |

`PackageLoader.buildGenerator()` compiles these templates into standard Blockly generator functions at registration time.

### C. Core (Non-Package) Blocks (`client/src/blocks/`)

A small number of blocks that aren't robot-specific are defined in JavaScript:
*   `blocks/utilities/utilities.js` — General-purpose blocks (wait, elapsed time, graph, print/log, etc.) that are available regardless of which packages are loaded.

### D. Toolbox Management (`client/src/config/`)

The toolbox is assembled in `config/toolbox.js`:
1.  **Core categories** are imported from `config/categories/` — `logic.js`, `loops.js`, `math.js`, `variables.js`, `functions.js`, `utilities.js`. These provide standard Blockly blocks.
2.  **Package categories** are appended automatically. `toolbox.js` calls `getAllPackageToolboxXml()` which collects the toolbox XML from every registered package.

```
Toolbox layout:
├── Logic        (core)
├── Loops        (core)
├── Math         (core)
├── Variables    (core)
├── Functions    (core)
├── Utilities    (core)
├── ── separator ──
├── ESP32        (package: esp32.json)
├── Vehicle      (package: vehicle.json)
└── UR5 Arm      (package: ur5.json)
```

To add blocks to an existing category, edit the corresponding file in `config/categories/` or the package JSON. No need to touch `toolbox.js` unless adding a new core category.

## 3. Adding a New Robot Package

1.  **Create** `client/src/packages/builtin/<robot>.json` following the schema above.
2.  **Import and register** it in `config/toolbox.js`:
    ```js
    import myPackage from '../packages/builtin/<robot>.json';
    registerPackage(myPackage);
    ```
3.  That's it — the package's blocks, generators, toolbox category, and reset actions are all active.

### Example: Minimal Package

```json
{
  "id": "my_robot",
  "name": "My Robot",
  "version": "1.0.0",
  "description": "Controls for My Robot",
  "blocks": [
    {
      "type": "my_robot_go",
      "definition": {
        "message0": "Go Forward at speed %1",
        "args0": [{ "type": "field_number", "name": "SPEED", "value": 1 }],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 160
      },
      "generator": {
        "type": "statement",
        "template": "{\n  var t = new ROSLIB.Topic({ ros: ros, name: '/my_robot/cmd', messageType: 'std_msgs/msg/Float64' });\n  t.publish(new ROSLIB.Message({ data: {{$SPEED}} }));\n}\n"
      }
    }
  ],
  "reset": [
    { "topic": "/my_robot/cmd", "type": "std_msgs/msg/Float64", "data": { "data": 0 } }
  ],
  "category": {
    "name": "My Robot",
    "colour": 160,
    "blocks": [{ "type": "my_robot_go" }]
  }
}
```

## 4. Coding Standards
*   **Naming**: Block type IDs should be prefixed by package (e.g., `ur5_move_single_joint`, `esp32_set_pin_on`).
*   **No IIFEs in templates**: The execution engine wraps all code in a global `async` wrapper. Use bare `{ ... }` blocks for scoping instead (see `async_execution.md`).
*   **Use `await wait(...)` for delays**: The `wait` function is available globally in the execution scope.
*   **Globals available**: `ros`, `ROSLIB`, `log`, `wait` are injected by the execution engine.
*   **AI hints**: Include `ai_description` on blocks and `subcategory_hints` in the `ai` section so the AI chat can use your blocks effectively.
