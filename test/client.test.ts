import { HttpClient } from "../src/shared/client";

interface Captured {
  url?: string;
  init?: RequestInit;
}

/** HttpClient with an injected fetch that records the outgoing request. */
function makeClient(opts?: {
  headers?: Record<string, string>;
}): { http: HttpClient; captured: Captured } {
  const captured: Captured = {};
  const http = new HttpClient({
    token: "test-token",
    headers: opts?.headers,
    fetch: (async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return {
        status: 200,
        ok: true,
        statusText: "OK",
        headers: { get: () => null },
        text: async () => JSON.stringify({ data: { ok: true } }),
      } as unknown as Response;
    }) as unknown as typeof fetch,
  });
  return { http, captured };
}

function headersOf(captured: Captured): Record<string, string> {
  return (captured.init?.headers ?? {}) as Record<string, string>;
}

describe("HttpClient request shape", () => {
  it("sends no Content-Type and no body for a body-less POST", async () => {
    // Regression: a `Content-Type: application/json` header with an empty body
    // is rejected by the API (HTTP 422) on endpoints that take no body.
    const { http, captured } = makeClient();

    await http.post({ path: "/my/ships/SHIP-1/orbit" });

    const headers = headersOf(captured);
    expect(
      Object.keys(headers).filter((h) => h.toLowerCase() === "content-type"),
    ).toEqual([]);
    expect(captured.init?.body).toBeUndefined();
  });

  it("sends no Content-Type for a GET", async () => {
    const { http, captured } = makeClient();

    await http.get({ path: "/my/agent" });

    const headers = headersOf(captured);
    expect(
      Object.keys(headers).filter((h) => h.toLowerCase() === "content-type"),
    ).toEqual([]);
    expect(captured.init?.body).toBeUndefined();
  });

  it("sends Content-Type and a JSON body when a body is present", async () => {
    const { http, captured } = makeClient();

    await http.post({ path: "/my/ships", body: { shipType: "SHIP_PROBE" } });

    expect(headersOf(captured)["Content-Type"]).toBe("application/json");
    expect(captured.init?.body).toBe(
      JSON.stringify({ shipType: "SHIP_PROBE" }),
    );
  });

  it("keeps an explicit Content-Type supplied via config.headers", async () => {
    const { http, captured } = makeClient({
      headers: { "Content-Type": "application/vnd.custom+json" },
    });

    await http.post({ path: "/x", body: { a: 1 } });

    expect(headersOf(captured)["Content-Type"]).toBe(
      "application/vnd.custom+json",
    );
  });

  it("still sends the auth and user-agent headers", async () => {
    const { http, captured } = makeClient();

    await http.post({ path: "/my/ships/SHIP-1/orbit" });

    const headers = headersOf(captured);
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["User-Agent"]).toBeTruthy();
  });
});
