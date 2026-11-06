import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ur from './locales/ur.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('translations', () => {
  it('Urdu has exactly the same keys as English', () => {
    expect(keys(ur).sort()).toEqual(keys(en).sort());
  });
});
