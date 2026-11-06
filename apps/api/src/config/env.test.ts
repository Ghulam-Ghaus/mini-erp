import { describe, expect, it } from 'vitest';
import { parseAppEnv } from './env.js';

describe('parseAppEnv', () => {
  it('applies defaults', () => {
    const env = parseAppEnv({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' });
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.CORS_ORIGINS).toEqual(['http://127.0.0.1:5173']);
  });

  it('parses PORT and a comma-separated CORS list', () => {
    const env = parseAppEnv({
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
      PORT: '53124',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.PORT).toBe(53124);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() => parseAppEnv({})).toThrow(/DATABASE_URL/);
  });
});
