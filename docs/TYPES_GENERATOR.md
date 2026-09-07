# TypeScript Types Generator

This generator converts IR (Intermediate Representation) class definitions into TypeScript code.

## Overview

The types generator reads `ir-class.json` and produces a TypeScript file with interface definitions.

## Usage

```bash
npm run generate
```

This will:
1. Generate `target/ir-class.json`
2. Generate `target/ir-function.json`
3. Generate `target/spacetraders-api/types.ts`

## Output

The generator produces a single TypeScript file with all interface definitions:

```typescript
// Auto-generated TypeScript types from IR
// Source: ir-class.json

/** An event that represents damage or wear to a ship's reactor, frame, or engine, reducing the condition of the ship. */
export interface ShipConditionEvent {
  symbol: string
  component: string
  /** The name of the event. */
  name: string
  /** A description of the event. */
  description: string
}

/** Details of the ship's fuel tanks including how much fuel was consumed during the last transit or action. */
export interface ShipFuel {
  /** The current amount of fuel in the ship's tanks. */
  current: object
  /** The maximum amount of fuel the ship's tanks can hold. */
  capacity: object
  /** An object that only shows up when an action has consumed fuel in the process. Shows the fuel consumption data. */
  consumed?: object
}

/** The navigation information of the ship. */
export interface ShipNav {
  systemSymbol: SystemSymbol
  waypointSymbol: WaypointSymbol
  route: ShipNavRoute
  status: ShipNavStatus
  flightMode: ShipNavFlightMode
}
```

## Known Limitations

- Type references like `SystemSymbol`, `WaypointSymbol` must be defined separately or imported.
- Only interfaces are generated. Enums and type aliases can be added in future versions.
- The current implementation generates types only for the navigate endpoint.

## Extending the Generator

The generator is located at `/src/generateTypesFromIR.ts`. It can be extended to:
- Generate enums and type aliases
- Add import statements for external types
- Output multiple files instead of a single file
- Handle nested type definitions

## Architecture

The generator follows a simple pipeline:
1. Read `ir-class.json`
2. Parse class definitions
3. Generate TypeScript code for each class
4. Write to output directory

All logic is in `generateTypesFromIR.ts` with clear separation between IR reading, code generation, and file writing.
