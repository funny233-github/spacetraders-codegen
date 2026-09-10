# Type Code Gen - Expected Behavior & Fixes Needed

## Current Problems

### Problem 1: Primitive Types Become Empty Interfaces

**Expected:**
```typescript
/** The symbol of the system. */
type SystemSymbol = string & { readonly brand: unique symbol };
// OR simply:
type SystemSymbol = string;
```

**Actual:**
```typescript
/** The symbol of the system. */
export interface SystemSymbol {
}
```

**Root Cause:** `determineClassKind()` returns `'interface'` for primitive scalar types (string, number, etc.) because it only checks for `enum` and `object`.

---

### Problem 2: Enums Not Generated in TypeScript Output

**Expected:**
```typescript
/** The ship's set speed when traveling between waypoints or systems. */
export enum ShipNavFlightMode {
  DRIFT = 'DRIFT',
  STEALTH = 'STEALTH',
  CRUISE = 'CRUISE',
  BURN = 'BURN'
}
```

**Actual:** Enums are present in IR but **not generated** in `generateTypesFromIR.ts`.

**Root Cause:** `generateTypesFromIR.ts` only handles `interface` and `class` kinds, ignoring `enum` and `typeAlias`.

---

### Problem 3: Type Aliases Not Handled

**Expected:**
```typescript
/** The type of waypoint. */
export type WaypointType = 
  | 'PLANET'
  | 'GAS_GIANT'
  | 'MOON'
  | 'ORBITAL_STATION'
  | ...;
```

**Actual:** Type aliases (like `WaypointType` which is an enum in the schema) are either missing or generated as empty interfaces.

---

### Problem 4: Missing Field Modifiers

**Expected:**
```typescript
/** The current amount of fuel in the ship's tanks. */
current: number;
/** An object that only shows up when an action has consumed fuel in the process. Shows the fuel consumption data. */
consumed?: {
  amount: number;
  timestamp: string;
};
```

**Actual:** Optional fields sometimes missing `?` modifier, and nested inline objects are not properly expanded.

---

### Problem 5: Duplicate/Redundant Interfaces

**Expected:**
- Only one interface for the response data structure

**Actual:**
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

These are redundant and should be merged or removed.

---

## Required Fixes

### 1. Update `determineClassKind()` to handle primitive types

```typescript
function determineClassKind(schema: SchemaLike): ClassKind {
  if (schema.enum && Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (schema.type === 'object' || !schema.type) {
    return 'interface';
  }
  if (schema.type === 'string' && schema.enum) {
    return 'enum';
  }
  // Handle primitive scalar types
  if (['string', 'number', 'boolean', 'integer'].includes(schema.type || '')) {
    return 'typeAlias';
  }
  return 'interface';
}
```

### 2. Add Enum Generation to `generateTypesFromIR.ts`

```typescript
function generateTypeCode(cls: IrClassDefinition): string {
  if (cls.kind === 'enum') {
    return generateEnumCode(cls);
  }
  // ... existing interface/class logic
}

function generateEnumCode(cls: IrClassDefinition): string {
  const lines: string[] = [];
  
  if (cls.comment) {
    lines.push(`/** ${cls.comment} */`);
  }
  
  lines.push(`export enum ${cls.name} {`);
  
  for (const member of cls.members || []) {
    lines.push(`  ${member.name} = '${member.value}',`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}
```

### 3. Add Type Alias Generation

```typescript
function generateTypeCode(cls: IrClassDefinition): string {
  if (cls.kind === 'typeAlias') {
    return generateTypeAliasCode(cls);
  }
  // ... existing logic
}

function generateTypeAliasCode(cls: IrClassDefinition): string {
  const lines: string[] = [];
  
  if (cls.comment) {
    lines.push(`/** ${cls.comment} */`);
  }
  
  // Extract the underlying type from the schema
  const schema = cls.typeSchema as SchemaLike;
  const baseType = extractBaseType(schema);
  
  lines.push(`export type ${cls.name} = ${baseType};`);
  
  return lines.join('\n');
}

function extractBaseType(schema: SchemaLike): string {
  if (schema.type === 'string') return 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  // Add constraints as branded types if needed
  return 'string'; // fallback
}
```

### 4. Fix Field Modifiers and Nested Objects

- Ensure `?` is added for optional fields
- For inline object fields, either:
  - Generate inline type definitions: `{ amount: number; timestamp: string }`
  - OR reference the generated interface (if it exists)

### 5. Remove Redundant Interfaces

- Clean up the IR generation to avoid creating `Data` and `Fuel` duplicates
- Or handle them in the code generator by merging/renaming

---

## Test Coverage Needed

- [ ] Primitive types generate correct type aliases
- [ ] Enums generate proper TypeScript enums
- [ ] Optional fields have `?` modifier
- [ ] Nested inline objects are properly represented
- [ ] No duplicate interfaces in output
- [ ] All existing tests still pass

---

## Success Criteria

After fixes, the generated `types.ts` should look like:

```typescript
/** The symbol of the system. */
export type SystemSymbol = string;

/** The symbol of the waypoint. */
export type WaypointSymbol = string;

/** The ship's set speed when traveling between waypoints or systems. */
export enum ShipNavFlightMode {
  DRIFT = 'DRIFT',
  STEALTH = 'STEALTH',
  CRUISE = 'CRUISE',
  BURN = 'BURN'
}

/** Details of the ship's fuel tanks including how much fuel was consumed during the last transit or action. */
export interface ShipFuel {
  /** The current amount of fuel in the ship's tanks. */
  current: number;
  /** The maximum amount of fuel the ship's tanks can hold. */
  capacity: number;
  /** An object that only shows up when an action has consumed fuel in the process. Shows the fuel consumption data. */
  consumed?: {
    amount: number;
    timestamp: string;
  };
}

// ... other types
```
