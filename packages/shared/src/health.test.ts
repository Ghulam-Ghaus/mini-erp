import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: 'up',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'maybe',
      db: 'up',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
