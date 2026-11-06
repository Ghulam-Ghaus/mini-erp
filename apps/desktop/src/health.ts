import { healthResponseSchema, type HealthResponse } from '@mini-erp/shared';

export interface WaitForHealthOptions {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
  /** Stop waiting early (e.g. the API process exited). Returns a reason or undefined. */
  shouldAbort?: () => string | undefined;
}

export class HealthTimeoutError extends Error {
  constructor(
    message: string,
    readonly lastStatus: string,
  ) {
    super(message);
    this.name = 'HealthTimeoutError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls the API health endpoint until it reports `status: ok`, or fails after `timeoutMs`. */
export async function waitForHealth({
  url,
  timeoutMs,
  intervalMs = 300,
  shouldAbort,
}: WaitForHealthOptions): Promise<HealthResponse> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'no response';

  while (Date.now() < deadline) {
    const abortReason = shouldAbort?.();
    if (abortReason) throw new HealthTimeoutError(abortReason, lastStatus);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const parsed = healthResponseSchema.safeParse(await res.json());
      if (parsed.success) {
        if (res.ok && parsed.data.status === 'ok') return parsed.data;
        lastStatus = `HTTP ${res.status}, database ${parsed.data.db}`;
      } else {
        lastStatus = `HTTP ${res.status}, unexpected body`;
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }

  throw new HealthTimeoutError(`API was not healthy after ${timeoutMs} ms`, lastStatus);
}
