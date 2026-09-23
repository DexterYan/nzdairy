// Bounded source fetch with one retry for transient failures. Timeouts,
// network errors, rate limits, and server errors retry; 4xx does not.

export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type SourceFetch =
  | { ok: true; body: string }
  | { ok: false; transient: boolean; detail: string };

const DEFAULT_TIMEOUT_MS = 10_000;
const ATTEMPTS = 2;

export async function fetchSource(
  url: string,
  options: FetchOptions = {},
): Promise<SourceFetch> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let last: SourceFetch = { ok: false, transient: true, detail: "not attempted" };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    last = await attemptFetch(url, fetchImpl, timeoutMs);
    if (last.ok || !last.transient) return last;
  }
  return last;
}

async function attemptFetch(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<SourceFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (response.status === 429 || response.status >= 500) {
      return { ok: false, transient: true, detail: `status ${response.status}` };
    }
    if (!response.ok) {
      return { ok: false, transient: false, detail: `status ${response.status}` };
    }
    return { ok: true, body: await response.text() };
  } catch (error) {
    // Node's DOMException is not an Error instance; check the name itself.
    const aborted =
      typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AbortError";
    return {
      ok: false,
      transient: true,
      detail: aborted ? `timed out after ${timeoutMs}ms` : describe(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
