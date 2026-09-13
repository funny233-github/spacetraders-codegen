# Duplicate Class Names in Generated `types.ts`

**Status:** Root cause identified. Awaiting decision on fix approach.
**Scope:** 2 duplicate declared names in `target/spacetraders-api/types.ts`.

---

## 1. The two duplicates

### A. `TradeSymbol1` — two **identical** interfaces
```ts
export interface TradeSymbol1 { tradeSymbol: string; units: number; }   // line 1847
export interface TradeSymbol1 { tradeSymbol: string; units: number; }   // line 1854
```

### B. `ExportToImportMap` — two **different-shaped** interfaces
```ts
export interface ExportToImportMap { exportToImportMap: ExportToImportMap; }  // line 2300
export interface ExportToImportMap { }                                        // line 2304 (empty)
```

Both are valid TypeScript (interfaces merge), so it is **not a compile error** —
just redundant / dead declarations.

---

## 2. The naming mechanism

`generateUniqueName()` (`src/generateIrClass.ts`) names every inline object from
its **first property** (or path fallback), deduping against `existingClasses`:

```ts
function generateUniqueName(schema, existingClasses, path): string {
  if (schema.properties) {
    const baseName = capitalize(Object.keys(schema.properties)[0]);
    let name = baseName, counter = 1;
    while (existingClasses.some((c) => c.name === name)) {   // dedup check
      name = `${baseName}${counter}`; counter++;
    }
    return name;
  }
  // fallback: derive from path
}
```

The **two-pass loop** in `generateIrClassForEndpoints`:

```ts
for (const ep of endpoints) {
  const inlineObjects = collectInlineObjectSchemas(ep.responseSchema, "response");
  const interfaceMap = new Map<SchemaLike, string>();

  // First pass: compute names against `classes`
  for (const o of inlineObjects) {
    const name = generateUniqueName(o.schema, classes, o.path);
    interfaceMap.set(o.schema, name);   // <-- name stored here, NOT pushed to classes
  }

  // Second pass: build classes
  for (const o of inlineObjects) {
    classes.push(convertSchemaToIrClass(interfaceMap.get(o.schema), o.schema, ...));
  }
}
```

---

## 3. The bug: **stateless first pass**

`generateUniqueName` dedups against `classes`, but during the first pass the
newly-assigned names go into `interfaceMap`, **never back into `classes`**.
So every inline object in one endpoint is named against the **same static
snapshot**. Two siblings with the same base name both pick the same `*N`
suffix → duplicate.

---

## 4. Case A — `TradeSymbol1`

**Endpoint:** `shipRefine` — `POST /my/ships/{shipSymbol}/refine` (201 response).

Response shape (from spec):
```json
"data": {
  "properties": {
    "produced": { "items": { "properties": { "tradeSymbol": ..., "units": ... } } },
    "consumed": { "items": { "properties": { "tradeSymbol": ..., "units": ... } } }
  }
}
```

Chain of causes:
1. `produced.items` and `consumed.items` are two distinct inline objects, both
   `{ tradeSymbol, units }` — same first prop `tradeSymbol` → base `TradeSymbol`.
2. The **`TradeSymbol` enum** already exists in `classes` (from component schemas)
   → both skip to `TradeSymbol1`.
3. Both computed against the static snapshot → both `TradeSymbol1`.
4. Second pass pushes both → two identical interfaces.

*Verified:* `generatedInterfaceNames` debug showed both at
`response.data.produced.items` and `response.data.consumed.items`.

---

## 5. Case B — `ExportToImportMap`

**Endpoint:** `getSupplyChain` — `GET /market/supply-chain` (201 response).

Response shape:
```json
"data": { "properties": { "exportToImportMap": { "type": "object",
  "additionalProperties": { "type": "array", "items": { "type": "string" } } } } }
```

Chain of causes:
1. Two inline objects are collected:
   - `response.data` = `{ exportToImportMap: … }` → **first-property** naming →
     base `ExportToImportMap`.
   - `response.data.exportToImportMap` = `{ additionalProperties: … }` → **no
     `properties`** → **path-fallback** naming → base `ExportToImportMap`.
2. Two different naming strategies collide on the same base, both against the
   static snapshot → both `ExportToImportMap`.
3. The `additionalProperties` object has no `properties`, so
   `convertSchemaToIrClass` renders it as empty `{}`.
4. Result: one interface with a field + one empty interface → TS merges them
   (not an error), but the empty one is dead weight.

---

## 6. Common root cause

**First-pass naming is stateless** — names are computed against a static
`classes` snapshot, so collisions *within one endpoint's inline objects*
(same first prop) or *between first-property and path-fallback naming* produce
duplicate names.

---

## 7. Fix options

| # | Approach | TradeSymbol1 | ExportToImportMap | Notes |
|---|----------|--------------|-------------------|-------|
| **A** | Dedup by **(name + normalized schema)** | ✓ merged (identical) | ✗ kept (different shapes) | Minimal; leaves empty `ExportToImportMap` |
| **B** | **Incremental** dedup — push each name into the working set as computed | → `TradeSymbol` + `TradeSymbol2` | → `ExportToImportMap` + `ExportToImportMap2` | No dups, but keeps redundant copies + `*2` suffixes |
| **C** | Name by **path segment** (`ProducedTradeSymbol`, `ExportImportMap`) | ✓ unique | ✓ unique | Guaranteed unique; less intuitive names |
| **D** | **A + bump**: dedup identical pairs *and* bump collisions | ✓ merged | ✓ merged/renamed | Cleanest; no dups, no dead weight |

**Recommended: D** — dedup byte-identical `(name, schema)` pairs (cleanly kills
`TradeSymbol1`) plus a small bump/empty rule for the path-collision (kills the
redundant `ExportToImportMap`). Minimal, keeps names intuitive, zero dups.

---

## 8. Open questions for analysis
1. Should identical-duplicate removal (A) also apply to the top-level schema-class
   loop, or only to inline objects?
2. For B, prefer **rename by path** (C-style) or **drop empty interfaces**?
3. Should naming incorporate the path always (guaranteed unique) at the cost of
   readability?
4. Are there *latent* collisions that didn't manifest (same-first-prop inline
   objects that happened to get different suffixes)? Worth a regression check.
5. Where to put the dedup key — canonical JSON of the schema, or structural hash?
