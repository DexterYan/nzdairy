import { describe, expect, it } from "vitest";
import { fetchSource } from "../workers/collection/fetch-source";

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("fetchSource", () => {
  it("returns the body of a successful response", async () => {
    const fetchImpl = (() => Promise.resolve(jsonResponse("<html></html>"))) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toEqual({ ok: true, body: "<html></html>" });
  });

  it("retries once after a transient server error and then succeeds", async () => {
    const responses = [jsonResponse("down", 503), jsonResponse("<html></html>")];
    const fetchImpl = (() => Promise.resolve(responses.shift() as Response)) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toEqual({ ok: true, body: "<html></html>" });
    expect(responses).toHaveLength(0);
  });

  it("gives up after two transient failures", async () => {
    const fetchImpl = (() => Promise.resolve(jsonResponse("down", 503))) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toMatchObject({ ok: false, transient: true });
  });

  it("does not retry a client error", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(jsonResponse("nope", 404));
    }) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toMatchObject({ ok: false, transient: false });
    expect(calls).toBe(1);
  });

  it("retries a rate-limit response", async () => {
    const responses = [jsonResponse("slow down", 429), jsonResponse("<html></html>")];
    const fetchImpl = (() => Promise.resolve(responses.shift() as Response)) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toEqual({ ok: true, body: "<html></html>" });
  });

  it("aborts a slow attempt, retries once, and reports the timeout", async () => {
    let calls = 0;
    // A real fetch rejects when its signal aborts; mimic that.
    const fetchImpl = ((_url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }) as typeof fetch;

    const result = await fetchSource("https://example.test/a", {
      fetch: fetchImpl,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({ ok: false, transient: true });
    expect(result.ok === false && result.detail).toContain("timed out");
    expect(calls).toBe(2);
  });

  it("retries a network failure and reports it after the second attempt", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.reject(new TypeError("connection refused"));
    }) as typeof fetch;

    const result = await fetchSource("https://example.test/a", { fetch: fetchImpl });

    expect(result).toMatchObject({ ok: false, transient: true });
    expect(calls).toBe(2);
  });
});
