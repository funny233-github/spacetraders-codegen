# IR Refactor Plan: IR File Structure Mirrors Generated Code

**Goal:** Restructure the IR so its **file layout mirrors the generated output**, and each
function's IR file carries both its **function IR** and its **local type IR**.

---

## 1. Current IR (single flat files)

```
ir-function.json   ← all functions (one big array)
ir-class.json      ← all classes (one big array)
```
Generated code splits into `types.ts` + `{tag}/{function}.ts`, but the IR does not.

---

## 2. New IR layout (mirrors generated code)

Files are named `<name>-IR.json` (explicit `.json` extension). Layout mirrors the output:

```
ir/
  types-IR.json                 ← mirrors types.ts   (all GLOBAL component types)
  global/getstatus-IR.json      ← mirrors global/getstatus.ts
  global/register-IR.json
  contracts/acceptcontract-IR.json
  fleet/purchaseship-IR.json
  ...
```

Each `{tag}/{function}-IR.json` is a **self-contained** JSON document:

```json
{
  "function": { /* function IR — signature + body */ },
  "types":    [ /* local type IR — response/request types used only by this function */ ]
}
```

- `types.ir` → `types.ts` (global, shared, named).
- `{tag}/{function}.ir` → `{tag}/{function}.ts` (function + its local types).

---

## 3. Per-file content

### 3.1 `types-IR.json` — global component types
```json
{
  "types": [
    { "name": "Chart",   "kind": "interface", "comment": "...", "fields": [ … ] },
    { "name": "TradeSymbol", "kind": "enum",  "members": [ … ] },
    { "name": "SomeType",  "kind": "typeAlias", "type": "…" }
  ]
}
```
Mirrors the current `ir-class.json` but **only component schemas** (the globally-named types).

### 3.2 `{tag}/{function}-IR.json` — function + local types
```json
{
  "function": {
    "name": "getStatus", "tag": "global", "method": "GET", "path": "/",
    "comment": "…", "security": [ … ],
    "parameters": [ { "name": "…", "type": "…", "required": true, "comment": "…" } ],
    "returnType": "GetStatusResponse",
    "body": {
      "apiCall":      { "method": "GET", "path": "/", "params": {}, "query": {} },
      "errorHandling": { "type": "generic", "genericMessage": "…" },
      "postProcessing": { "type": "simple", "dataField": "data" }
    }
  },
  "types": [
    // LOCAL types (inline response/request structures) — defined in THIS file,
    // no import needed. Global types are NOT listed here.
    { "name": "GetStatusResponse", "kind": "interface", "fields": [ … ] }
  ]
}
```

---

## 4. Reference resolution (local vs global)

- **Local types** (`types[]` in the same file): defined in-file, referenced by name, **no import**.
- **Global types** (from `types.ir`): referenced by name, **imported from `../types`**.

Generator rule: collect every type name referenced in the function signature + local
type fields; any name **not** defined in the file's own `types[]` is a global import
(imported from `../types` in `types-IR.json`).

---

## 5. Decisions (locked)

1. **File format.** `<name>-IR.json` per file (mirrors output, small diffs). ✓
2. **Response type location.** Local function file (not global `types.ts`). ✓
3. **Nested fields (2B).** Named output type; **nested fields are inline** object
   literals. `is_valid()` still validates nested fields by recursing into them. ✓
4. **Naming nested types (3).** Nearly N/A under 2B — nested fields are inline, so no
   nested named types and no `*1` collision problem. Only the response type is named.
5. **`is_valid()` scope (4A).** Only the response type is validated by the function body;
   nested fields are checked transitively. ✓

## 8. Response type shape (R1 locked)

Object response => named local class with `IrField2[]` fields:
```json
"responseType": {
  "name": "GetStatusResponse",
  "kind": "class",                 // "class" if it has any field constraint (=> is_valid()); else "interface"
  "fields": [
    { "name": "status", "type": { "kind": "primitive", "type": "string" }, "optional": true },
    …
  ]
}
```
- Non-object responses (R2 scalar/void, R3 `$ref`): **no** `responseType`; the function uses a
  bare `returnType` string (`"void"`, `"string"`, or a global ref name).

## 9. Function-file IR shape (locked)
```json
{
  "function": { /* name, tag, method, path, comment, security, parameters[], returnType, body */ },
  "responseType": { /* R1 only; omitted for R2/R3 */ }
}
```
Generator rule: if `responseType` exists → emit the named local type, use it as `returnType`,
and validate it (call `is_valid()` when `kind: "class"`). Else use `returnType` directly and
import it if it is a global ref.

## 10. `kind` selection (K1 locked)
`responseType.kind` is **auto-detected**: `"class"` if the type has any field constraint
(`is_valid()` emitted), otherwise `"interface"`. The IR builder computes it from the fields.

## 7. Field-type IR (F2 — structured tree, locked)

Field types are a **structured tree**, not opaque strings. Constraints (for `is_valid()`)
live on the **field**; the tree is purely structural.

```ts
interface IrField2 {
  name: string;
  type: IrType;                 // structural shape
  optional?: boolean;           // -> field? in TS
  description?: string;
  // constraints (checked by is_valid()):
  minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number;
  pattern?: string; format?: string;
  enum?: string[];              // runtime one-of check
}

type IrType =
  | { kind: "ref"; name: string }                 // -> global type name (imported)
  | { kind: "primitive"; type: "string" | "number" | "boolean" }
  | { kind: "enum"; values: string[] }            // -> "a" | "b"  (enum = type node, locked)
  | { kind: "array"; items: IrType }
  | { kind: "object"; fields: IrField2[]; mapValue?: IrType }
```
2. **Local response type: named vs inlined.** Keep `GetStatusResponse` as a named local
   interface (readable signature `Promise<GetStatusResponse>`), or inline the object
   literal directly in the signature per the "inline is better" rule?
3. **What counts as local.** Only the response type? Or also request type + any inline
   object used in params/body? (Recommend: everything the function references that is not
   a global component type.)
4. **Empty `types[]`.** Functions that only use global types still get a file with an
   empty `types` array — fine, or omit the key?
5. **`is_valid()` for local types.** Do local (inline) types need constraint metadata +
   `is_valid()`, or only global types? (Inline object literals can't carry methods.)
6. **Generator wiring.** `generateTypesFromIR` reads `types-IR.json`; `generateFunctionsFromIR`
   reads each `{tag}/{function}-IR.json`. Does the current single-file pipeline map cleanly, or
   need per-file iteration?

---

## 6. Suggested next step
Confirm the §7 `IrType`/`IrField2` format, then wire the generator to (a) emit
`types-IR.json` from component schemas and (b) emit one `{tag}/{function}-IR.json` per
endpoint containing the function + its local response type (fields use `IrType`).
