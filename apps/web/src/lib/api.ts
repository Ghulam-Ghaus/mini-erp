import { healthResponseSchema, HEALTH_PATH, type HealthResponse } from '@mini-erp/shared';

const FALLBACK_API_URL = 'http://127.0.0.1:3000';

/** API base URL: from Electron when running in the desktop app, else from VITE_API_URL. */
export function getApiBaseUrl(): string {
  return window.desktop?.apiBaseUrl ?? import.meta.env.VITE_API_URL ?? FALLBACK_API_URL;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiBaseUrl()}${HEALTH_PATH}`);
  // 503 still carries a valid health body (database down), so parse either way.
  return healthResponseSchema.parse(await res.json());
}
