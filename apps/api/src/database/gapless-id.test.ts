import { describe, expect, it, vi } from 'vitest';
import { nextId, type GaplessTable, type TxClient } from './gapless-id.js';

function fakeTx(rows: { last_value: number }[]): TxClient {
  // Only $queryRaw is used by nextId; the cast keeps the test small.
  return { $queryRaw: vi.fn().mockResolvedValue(rows) } as unknown as TxClient;
}

describe('nextId', () => {
  it('returns the counter value from the database', async () => {
    await expect(nextId(fakeTx([{ last_value: 7 }]), 'users')).resolves.toBe(7);
  });

  it('throws when no row is returned', async () => {
    await expect(nextId(fakeTx([]), 'users')).rejects.toThrow(/Could not allocate/);
  });

  it('rejects unknown table names', async () => {
    await expect(nextId(fakeTx([]), 'nope' as GaplessTable)).rejects.toThrow(/Unknown gapless/);
  });
});
