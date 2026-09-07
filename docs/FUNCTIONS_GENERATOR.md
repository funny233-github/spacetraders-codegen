# TypeScript Function Generator

This generator converts IR (Intermediate Representation) function definitions into TypeScript function implementations.

## Overview

The function generator reads `ir-function.json` and produces TypeScript code with complete function implementations, organized by API tags.

## Usage

```bash
npm run generate
```

This will automatically generate both types and functions as part of the build process.

## Output Structure

Functions are organized in a tag-based directory structure:

```
target/spacetraders-api/
  types.ts              # All type definitions
  <tag1>/               # Folder named after API tag (e.g., ships, fleets)
    <functionName>.ts   # Function implementation file
  <tag2>/
    <functionName>.ts
```

## Example Output

For the navigate endpoint with tag "Fleet":

```
target/spacetraders-api/
  fleet/
    navigateship.ts
```

## Generated Code

```typescript
import { HttpClient } from "./client";
import { ApiResponse, ApiError } from "./errors";

/** Navigate to a target destination... */
export async function navigateShip(
  http: HttpClient,
  shipSymbol: string,
  waypointSymbol: string
): Promise<ApiResponse<DataFuel>>
{
  const request = {
    waypointSymbol: waypointSymbol,
  };
  const response = await http.request('post', `/my/ships/${shipSymbol}/navigate`, {
    body: request
  });
  if (!response.ok) {
    throw new ApiError(response, "API request failed");
  }
  return response.data;
}
```

## Function Naming

Function names are derived from the OpenAPI `operationId` when available, converted to camelCase. For example:
- `operationId: "navigate-ship"` → `navigateShip`
- Fallback to endpoint name if operationId is not present

## Tag-Based Organization

Each function is placed in a folder named after its API tag (from OpenAPI tags). This provides natural grouping and modularity.

## Generation Pipeline

1. **Function Signature**: Constructed from `name`, `parameters`, and `returnType`
2. **Request Body**: Automatically created from parameters not used as path/query
3. **API Call**: Generated using `apiCall` configuration (method, path, params, body)
4. **Error Handling**: Produced from `errorHandling` configuration
5. **Post-Processing**: Generated from `postProcessing` configuration

## Features

- ✅ **Automatic request body creation** from function parameters
- ✅ **Template literal URLs** with path parameter injection
- ✅ **Structured error handling** (generic or specific)
- ✅ **Flexible post-processing** (simple return, transform, or custom code)
- ✅ **JSDoc comments** preserved in generated code
- ✅ **Tag-based organization** for modularity

## Limitations

- The current implementation assumes a specific `HttpClient` API.
- Path parameter injection uses template literals.
- Query parameters are not yet fully implemented.
- Functions are generated per tag folder (one file per function).

## Extending the Generator

The generator is located at `/src/generateFunctionsFromIR.ts`. It can be extended to:
- Support different HTTP client libraries
- Add request/response transformation middleware
- Generate additional metadata or documentation
- Add validation and input sanitization

## Relationship to Type Generator

Both generators work together:
- `generateTypesFromIR` creates type definitions in `types.ts`
- `generateFunctionsFromIR` creates implementations organized by tags

Together they provide a complete TypeScript API wrapper generation pipeline.
