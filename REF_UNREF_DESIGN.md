# Solution: Split Ref vs. Inline (Unref) — New IR Format

**Goal:** Eliminate duplicate class names (`TradeSymbol1`, `ExportToImportMap`, …) by
stopping the generation of a flat, globally-named interface for *every* inline object.
Instead, separate the schema into **referenced component types** (global `types.ts`) and
**inline structures** (local to each function file).

---

## 1. Current problem (recap)

- `generateIrClassForEndpoints` generates a **flat list of named classes**:
  - schema classes from `components.schemas`,
  - per-endpoint response interfaces,
  - **inline object interfaces** named by first-property with a counter
    (`TradeSymbol1`, `ExportToImportMap2`, …).
- The inline-object naming is **stateless** (first pass names against a static
  `classes` snapshot), so siblings with the same base name collide → duplicates.
- Everything lands in one `types.ts`, so naming any inline object globally forces
  collisions.

## 2. Core idea: ref vs. unref

Any response/request object can be split into two kinds of members:

| Kind | Example | Where it lives |
|------|---------|----------------|
| **ref** (`$ref`) | `{ "$ref": "../models/Chart.json" }` | **global `types.ts`** — the component schema `Chart` is defined once, referenced everywhere |
| **unref** (inline) | `{ "properties": { chart, waypoint, agent }, "type": "object" }` | **function's own file** — the inline wrapper `{ chart: Chart; waypoint: Waypoint; agent: Agent }` |

Example response:
```json
"data": {
  "type": "object",
  "required": ["chart", "waypoint", "agent"],
  "properties": {
    "chart":  { "$ref": "../models/Chart.json" },
    "waypoint": { "$ref": "../models/Waypoint.json" },
    "agent":  { "$ref": "../models/Agent.json" }
  }
}
```

- `Chart`, `Waypoint`, `Agent` → **global types.ts** (named, deduped by component name).
- The inline `data` wrapper → **local type in the function file**, referencing the global types.

### Why this removes duplicates

- **Refs are already deduped** by component name — no naming problem there.
- **Inline objects are no longer named globally.** They are either:
  - **inlined** as object-literal types (`Array<{ tradeSymbol: string; units: number }>`)
    — e.g. `shipRefine`'s `produced`/`consumed` items — so **no `TradeSymbol1` at all**, or
  - **named locally** in the function file (scoped per file), so two functions can each
    have their own `TradeSymbol` with zero collision.
- No more `*1`, `*2`, `*N` counter suffixes.

---

## 3. New IR format

The IR must carry, per endpoint, the schema as a **tree of inline nodes with refs**,
so the generator can emit two outputs:

- **global types.ts** from component schemas (named),
- **local types** in each function file from inline structures (inlined or locally named).

### 3.1 Schema node (unified ref | inline)

```ts
// A $ref to a component schema (lives in global types.ts)
interface IrRef {
  $ref: string;              // component name, e.g. "Chart"
  description?: string;
}

// An inline schema (no $ref). `type` is always present.
interface IrSchema {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  properties?: Record<string, IrNode>;
  items?: IrNode;
  additionalProperties?: IrNode | boolean;
  enum?: string[];
  format?: string;
  constraints?: ConstraintSet;   // minLength/maxLength/minimum/maximum/pattern/...
  description?: string;
}

// A schema node is either a ref or an inline schema
type IrNode = IrRef | IrSchema;
```

### 3.2 Endpoint IR

```ts
interface IrParameter {
  name: string;
  location: "path" | "query";
  schema: IrNode;
  required: boolean;
  comment?: string;
}

interface IrError {
  code?: number;                 // present only for specific-status errors
  message: string;
}

interface IrEndpoint {
  name: string;                  // function name (getStatus, acceptContract, …)
  tag: string;                   // group / subdirectory
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;                  // template path, e.g. "/my/ships/{shipSymbol}/refine"
  comment?: string;
  security?: Array<Record<string, string[]>>;

  parameters?: IrParameter[];    // path + query params
  requestBody?: IrNode;          // body schema (inline or $ref)

  // Response: the full JSON schema (envelope { data: … } or flat).
  // The generator strips the `data` envelope when present and emits a local type.
  response?: IrNode;

  errors?: IrError[];
}
```

### 3.3 Document IR

```ts
interface IrDocument {
  // Named component schemas → global types.ts
  components: Array<{ name: string; node: IrNode }>;

  // One entry per endpoint → local types + function file
  endpoints: IrEndpoint[];
}
```

---

## 4. Generation from the new IR

### 4.1 Global `types.ts`
- Emit every `components[i]` as a named interface/class/enum/typeAlias.
- These are the only *globally-named* types. Refs resolve to them by name.

### 4.2 Per-function file
For each endpoint:
1. **Request type** (if `requestBody`): inline-walk the body schema → a local type
   (named `Request` or inline) referencing global types.
2. **Response type**: strip the `{ data: … }` envelope → inline-walk the payload → a
   local type, named after the function (`GetStatusResponse`) or inlined.
3. **Function**: signature uses the local response type; body calls `http.get/post<T>`.
4. **Imports**: import only the global types the local structure references (the refs).

Inline-walk rules:
- `$ref` → reference the global type by name.
- object with `properties` → inline `{ field: Type; … }` (or a named local type).
- array → `Array<itemType>` where `itemType` recurses (refs stay refs, inline objects
  inline).
- primitives → `string | number | boolean`.

### 4.3 Naming decisions (see §6)
- Local response types: named per function, or fully inlined.
- Inline objects: default to inlined; optionally named when reused within one file.

---

## 5. Open questions for discussion

1. **Inline vs. name local types.** Should inline objects be always inlined (simplest,
   no names) or named when reused within a single file? (e.g. a shared inline type used
   twice in one response.)
2. **Local type naming scope.** Local types are file-scoped — is that acceptable, or do
   we want a shared per-tag local module to avoid duplicating an inline type across
   functions that share it?
3. **Envelope stripping.** Always strip `{ data: … }`, or only when `data` is the sole
   property? (Some responses have `{ data, other }`.)
4. **Self / circular refs.** How to represent recursive schemas (e.g. `ExportToImportMap`
   referencing itself) with inlined local types?
5. **Constraints.** Do inline (local) types need `is_valid()` too, or only global types?
6. **`additionalProperties`** (map types) — inline as `{ [k: string]: V }` or name them?
7. **Backwards compatibility** — does the old flat `IrClassJson` still get used anywhere?

---

## 6. Proposed naming strategy (draft)

- **Global types.ts:** component schemas only (already named by component).
- **Local types:** inline by default; name a local type only when the *same* inline
  object appears more than once within a single endpoint's response/request.
- **Response type:** named after the function (`GetStatusResponse`) — keeps the
  function signature readable and matches the existing Medium-1 naming.
