/**
 * Unified error types. Error handling policy belongs to the hand-written part
 * (product decisions), not to the compiler.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly raw: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Error returned when the API rate limit (2 requests / second) is exceeded and
 * the client's retries (see HttpClient.send) are exhausted. The client retries
 * 429s automatically before surfacing this.
 */
export class RateLimitError extends ApiError {
  constructor(retryAfter: number | null, retryAfterMs: number) {
    super(
      429,
      null,
      `API rate limit exceeded. Retry after ${retryAfterMs}ms${retryAfter ? ` (Retry-After: ${retryAfter}s)` : ""}`,
    );
    this.name = "RateLimitError";
  }
}
