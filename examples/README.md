# Spacetraders API Examples

This directory contains example usage of the generated `spacetraders-api` module.

## Prerequisites

- **SpaceTraders Token**: Get your API token from [SpaceTraders](https://spacetraders.io)
- **Environment Variable**: Set `AGENT_TOKEN` with your token

```bash
export AGENT_TOKEN="your-space-traders-token-here"
```

## Examples

### 1. Basic Example (`basic-example.ts`)

A simple demonstration of calling the `navigateShip` function:

```bash
export AGENT_TOKEN="your-token"
npm run example:basic
```

**What it shows:**
- Initializing the `HttpClient`
- Calling the generated `navigateShip()` function
- Handling success and error responses
- Basic error handling

### 2. Advanced Example (`advanced-example.ts`)

Advanced patterns including retries, batch operations, and comprehensive error handling:

```bash
export AGENT_TOKEN="your-token"
npm run example:advanced
```

**What it shows:**
- Retry logic with exponential backoff
- Rate limit handling (`RateLimitError`)
- Batch API calls for multiple ships
- Formatted output and data display

### 3. Test Example (`test-example.ts`)

Using the API in test suites with mock dependencies:

```bash
export AGENT_TOKEN="your-token"
npm run example:test
```

**What it shows:**
- Creating a mock `HttpClient` for unit tests
- Writing test cases with `describe()` and `test()`
- Integration test setup/teardown patterns

## API Structure

The generated module is organized as follows:

```
target/spacetraders-api/
├── client.ts          # HttpClient class
├── errors.ts          # Error classes (ApiError, RateLimitError)
├── types.ts           # Type definitions
└── fleet/
    └── navigateship.ts  # Generated navigate function
```

## Usage in Your Project

### Import the generated API

```typescript
import { HttpClient } from './target/spacetraders-api/client';
import { navigateShip } from './target/spacetraders-api/fleet/navigateship';
import { ApiError } from './target/spacetraders-api/errors';
```

### Basic usage pattern

```typescript
const http = new HttpClient({
  token: process.env.AGENT_TOKEN,
});

try {
  // Returns data directly, throws ApiError on failure
  const result = await navigateShip(http, 'ship-123');
  console.log('Success:', result);
} catch (error) {
  if (error instanceof ApiError) {
    console.log('API Error:', error.status, error.message);
  } else {
    console.log('Exception:', error);
  }
}
```

## Key Components

### HttpClient

The core HTTP client with built-in features:
- **Rate limiting**: Automatically throttles to 2 requests/second
- **Authentication**: Handles Bearer token injection
- **URL building**: Parameter substitution and encoding
- **Unified responses**: `{ ok: true, data: T } | { ok: false, error: E }`

### Error Classes

- **`ApiError`**: Standard API error with status code and message
- **`RateLimitError`**: Specialized error for rate limit exceeded (429)

### Generated Functions

Each function follows a consistent pattern:
```typescript
export async function <functionName>(
  http: HttpClient,
  ...params
): Promise<T>
```

Functions return the **data directly** (type `T`) and **throw `ApiError`** on failures, providing clean async/await syntax without manual response checking.

## Best Practices

1. **Catch errors with try/catch** – Functions throw `ApiError` on failures
2. **Check error instanceof ApiError** to access status and message
3. **Use environment variables** for tokens (never hardcode)
4. **Wrap in try/catch** for network-level errors
5. **Follow rate limits**: The client auto-throttles, but be mindful

## Troubleshooting

### "Missing path parameter" error
- Ensure all required path parameters are provided to the function

### "Token required" error
- Set `AGENT_TOKEN` environment variable or pass `config.token`

### "Rate limit exceeded"
- The client automatically waits 500ms between requests
- For manual handling, catch `RateLimitError` and implement backoff

## Next Steps

1. Generate more API functions using the codegen
2. Integrate with your application's error handling
3. Add custom request/response transformations
4. Extend the `HttpClient` with additional features

## Further Reading

- [Documentation](../docs/API_GEN_CODE.md) - Codegen documentation
- [API Reference](../target/spacetraders-api/types.ts) - Generated types
- [Client API](../target/spacetraders-api/client.ts) - HttpClient methods
