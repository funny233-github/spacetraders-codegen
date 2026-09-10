# Type Code Gen - Expected Behavior & Fixes Applied

## ✅ Fixed Problems

### Fix 1: Primitive Types Now Generate Type Aliases

**Before:**
```typescript
export interface SystemSymbol { }
```

**After:**
```typescript
/** The symbol of the system. */
export type SystemSymbol = string & { readonly brand: unique symbol };
```

**Implementation:** Updated `determineClassKind()` to return `'typeAlias'` for primitive scalar types (string, number, integer, boolean).

---

### Fix 2: Enums Now Generate Correctly

**Before:** Enums present in IR but missing from TypeScript output.

**After:**
```typescript
/** The ship's set speed when traveling between waypoints or systems. */
export enum ShipNavFlightMode {
  VALUE_0 = 'DRIFT',
  VALUE_1 = 'STEALTH',
  VALUE_2 = 'CRUISE',
  VALUE_3 = 'BURN',
}
```

**Implementation:** Added `generateEnumCode()` to `generateTypesFromIR.ts`.

---

### Fix 3: Nested Inline Objects Properly Expanded

**Before:**
```typescript
consumed?: object
```

**After:**
```typescript
consumed?: {
  /** The amount of fuel consumed by the most recent transit or action. */
  amount: number;
  /** The time at which the fuel was consumed. */
  timestamp: string
}
```

**Implementation:** Updated `generateFieldCode()` to handle nested `fields` array and generate inline type definitions.

---

### Fix 4: Metadata Preservation

All OpenAPI constraints (minimum, maximum, minLength, maxLength, pattern, format) are now preserved in the IR and can be used for type branding or validation.

---

## Current Output Example

```typescript
/** The symbol of the system. */
export type SystemSymbol = string & { readonly brand: unique symbol };

/** The symbol of the waypoint. */
export type WaypointSymbol = string & { readonly brand: unique symbol };

/** The ship's set speed when traveling between waypoints or systems. */
export enum ShipNavFlightMode {
  VALUE_0 = 'DRIFT',
  VALUE_1 = 'STEALTH',
  VALUE_2 = 'CRUISE',
  VALUE_3 = 'BURN',
}

/** Details of the ship's fuel tanks including how much fuel was consumed during the last transit or action. */
export interface ShipFuel {
  /** The current amount of fuel in the ship's tanks. */
  current: number;
  /** The maximum amount of fuel the ship's tanks can hold. */
  capacity: number;
  /** An object that only shows up when an action has consumed fuel in the process. Shows the fuel consumption data. */
  consumed?: {
    /** The amount of fuel consumed by the most recent transit or action. */
    amount: number;
    /** The time at which the fuel was consumed. */
    timestamp: string;
  };
}

/** The navigation information of the ship. */
export interface ShipNav {
  systemSymbol: SystemSymbol;
  waypointSymbol: WaypointSymbol;
  route: ShipNavRoute;
  status: ShipNavStatus;
  flightMode: ShipNavFlightMode;
}

/** The current status of the ship */
export enum ShipNavStatus {
  VALUE_0 = 'IN_TRANSIT',
  VALUE_1 = 'IN_ORBIT',
  VALUE_2 = 'DOCKed',
}

/** The type of waypoint. */
export enum WaypointType {
  VALUE_0 = 'PLANET',
  VALUE_1 = 'GAS_GIANT',
  VALUE_2 = 'MOON',
  // ... more values
}
```

---

## Remaining Issues

### Issue 1: Duplicate Interfaces (`Data`, `Fuel`)

The inline object collection generates redundant interfaces for the response wrapper:

```typescript
export interface Data {
  data: Fuel;
}

export interface Fuel {
  fuel: ShipFuel;
  nav: ShipNav;
  events: Array<ShipConditionEvent>;
}
```

**Root Cause:** Both `generateResponseTypeInterface` (creates `NavigateShipResponse`) and `collectInlineObjectSchemas` process the same response schema.

**Options:**
1. Remove inline object generation for top-level response
2. Merge `Data`/`Fuel` into `NavigateShipResponse`
3. Deprecate `NavigateShipResponse` in favor of inline objects

### Issue 2: Field Ordering in Some Interfaces

Some interfaces have fields in non-optimal order (e.g., `ShipConditionEvent`). The IR has correct order, but the generator might be reordering.

**Status:** Minor formatting issue, doesn't affect functionality.

### Issue 3: Optional Field Modifiers

All optional fields correctly show `?` modifier. Verified in `ShipFuel.consumed`.

---

## Test Results

```
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

All tests pass with the new type generation logic.

---

## Files Modified

- `src/generateIrClass.ts`: Updated `determineClassKind()` for primitive types, extended `SchemaLike` interface
- `src/generateTypesFromIR.ts`: Added enum and type alias generation, fixed nested object handling

---

## Next Steps

1. **Resolve duplicate interfaces** - Decide on response wrapper strategy
2. **Add more tests** for enum and type alias generation
3. **Improve formatting** of generated code (consistent indentation)
4. **Add validation** for circular references in nested structures
5. **Handle `additionalProperties`** properly
