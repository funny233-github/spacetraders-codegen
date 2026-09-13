# spacetraders-codegen

Generate TypeScript types and API-client functions for the
[SpaceTraders](https://spacetraders.io) v2 API from its OpenAPI specification.

This tool reads the official SpaceTraders OpenAPI spec (plus a directory of model
definitions), produces an intermediate representation (IR) in JSON, and then emits
idiomatic TypeScript: a shared HTTP client, error classes, a `types.ts` module of
component types, and one function per API endpoint.

## Features

- **One function per endpoint** — each endpoint becomes an exported async function
  that returns the response data directly and throws `ApiError` on failure.
- **Typed component model** — a `types.ts` module with enums, interfaces, and
  classes (with `is_valid()` validation) for every referenced component schema.
- **Per-file IR** — a self-describing IR that mirrors the generated code layout, so
  it is easy to inspect, diff, and regenerate.
- **No duplicate type names** — response types are emitted locally where needed, so
  sibling inline objects no longer collide.
- **Tag filtering** — generate the whole API or a subset by tag.
- **Rate-limited client** — the generated `HttpClient` auto-throttles to 2 req/s.

## Requirements

- Node.js 18+
- Git (the OpenAPI spec lives in the `api-docs` git submodule)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Ensure the OpenAPI spec submodule is checked out
git submodule update --init --recursive

# 3. Build the codegen
npm run build

# 4. Generate types + functions
npm run generate
```

After `npm run generate`, the outputs land in `target/`:

```
target/
├── ir/                              # intermediate representation (JSON)
│   ├── types-IR.json                #   global component types (deduped)
│   └── <tag>/<function>-IR.json     #   one per endpoint (self-contained)
└── spacetraders-api/                # generated TypeScript module
    ├── client.ts                    #   HttpClient + auth
    ├── errors.ts                    #   ApiError, RateLimitError
    ├── types.ts                     #   component types (enum/interface/class)
    └── <tag>/<functionName>.ts      #   one function per endpoint
```

## Usage

### Generate everything

```bash
npm run generate
```

### Generate a subset by tag

Filter by comma-separated tag names with the `TAGS` environment variable:

```bash
TAGS="Agents,Fleet" npm run generate
```

When `TAGS` is unset, every endpoint in the spec is generated.

### Run the tests

```bash
npm test
```

### Run an example

The basic example calls `getMyAgent` and requires a SpaceTraders token:

```bash
export AGENT_TOKEN="your-space-traders-token"
npm run example:basic
```

See [`examples/README.md`](examples/README.md) for more.

## How it works

The pipeline (`src/index.ts`) runs six steps:

1. **Merge spec** — load `api-docs/reference/SpaceTraders.json` and merge every file
   in `api-docs/models` into `components.schemas`.
2. **Extract endpoints** — parse all paths/operations into a list of endpoint IR
   definitions.
3. **Generate `types-IR.json`** — build the deduped set of global component types
   (only those actually referenced), from the merged schemas.
4. **Generate per-function IR** — for each endpoint, write
   `{tag}/{function}-IR.json` containing the function IR plus its local response type.
5. **Generate `types.ts`** — render the global IR to `target/spacetraders-api/types.ts`.
6. **Generate functions** — render each function IR to
   `target/spacetraders-api/{tag}/{function}.ts`, copying `client.ts` and `errors.ts`
   (from `src/shared`) into the output root.

## The intermediate representation (IR)

Each IR file is plain JSON that mirrors the TypeScript it produces.

### `types-IR.json`

```jsonc
{
  "types": [
    { "name": "FactionSymbol", "kind": "enum", "members": [{ "name": "COSMIC", "value": "COSMIC" }, ...] },
    { "name": "Agent", "kind": "class", "comment": "...", "fields": [ ... ] }
  ]
}
```

Component types are one of:

| `kind`      | Description                                              |
|-------------|----------------------------------------------------------|
| `enum`      | String enum + TS union (`export enum` + `"a" \| "b"`)    |
| `interface` | Plain object type (no validation)                        |
| `class`     | Object type with constraints → gets an `is_valid()` method |
| `typeAlias` | `export type Name = <baseType>;`                         |

### `{tag}/{function}-IR.json`

```jsonc
{
  "function": {
    "name": "getMyAgent",
    "tag": "Global",
    "comment": "Fetch your agent's details.",
    "security": [{ "AgentToken": [] }],
    "parameters": [ ... ],
    "returnType": "Agent",
    "body": { "apiCall": { ... }, "errorHandling": { ... }, "postProcessing": { ... } }
  },
  "responseType": { "name": "GetStatusResponse", "kind": "interface", "fields": [ ... ] }
}
```

- `responseType` is **optional** and present only for inline-object responses
  (shape **R1**). Scalar/void responses (**R2**) and `$ref` responses (**R3**) omit it
  and use the bare `returnType`.
- Any type name not defined in the file's own `responseType`/`types[]` is imported from
  `../types` (the global component module).

### Type nodes (`IrType`)

Field types are a discriminated union:

```
ref        -> a named global type (imported from ../types)
primitive  -> "string" | "number" | "boolean"
enum       -> "a" | "b"  (real TS union)
array      -> Array<items>
object     -> inline object literal type
```

Constraints (`minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `format`,
`enum`) live on the field and drive `is_valid()`.

### `is_valid()`

A class response is validated by its function body: the data is copied into a new
instance and `is_valid()` is called. Nested fields are checked transitively — object
fields recurse and array items are iterated. Optional fields are guarded so nested
property access typechecks under strict null checks.

## Output conventions

- **Function names** are derived from the operation ID (camelCased, first letter
  lowercase) or the endpoint name.
- **Return types** are named interfaces derived from the function name for inline-object
  responses (e.g. `GetStatusResponse`).
- **Parameters** are ordered required-then-optional; request-body fields become function
  parameters and are renamed to avoid collisions with path/query params.
- **Responses** are returned as raw data; failures throw `ApiError`.

## Project layout

```
src/
├── index.ts                    # pipeline: merge -> extract -> IR -> emit
├── mergeSpec.ts                # load + merge OpenAPI spec and models
├── extractEndpoint.ts          # parse endpoints from the spec
├── convertSchemaToIrType.ts    # OpenAPI schema -> IrType tree
├── irTypes.ts                  # IR type definitions
├── generateGlobalTypesIR.ts    # build types-IR.json
├── generateFunctionIR.ts       # build per-function IR + local response type
├── generateTypesFromIR.ts      # render types.ts
├── generateFunctionsFromIR.ts  # render one file per endpoint
├── generateIrClass.ts          # (legacy) monolithic class IR
├── generateIrFunction.ts       # shared single-function IR
└── renderIr.ts                 # shared renderer (types, fields, is_valid)
src/shared/
├── client.ts                   # HttpClient (copied into output root)
└── errors.ts                   # ApiError / RateLimitError (copied into output root)
```

## Documentation

- [`examples/README.md`](examples/README.md) — using the generated API
- [`docs/FUNCTIONS_GENERATOR.md`](docs/FUNCTIONS_GENERATOR.md) — function generation
- [`docs/TYPES_GENERATOR.md`](docs/TYPES_GENERATOR.md) — type generation

## License

MIT
