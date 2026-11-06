import { z } from 'zod';

/** Path of the API health endpoint, polled by the desktop app before showing the window. */
export const HEALTH_PATH = '/health';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['up', 'down']),
  version: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
