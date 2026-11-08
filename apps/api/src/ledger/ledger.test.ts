import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeNextLedgerBalance } from './ledger.module.js';

describe('LedgerService pure balance calculations', () => {
  it('computes supplier payable balance: opening + purchase credit - payment debit - return debit', () => {
    // 1. Opening balance 50,000.00 credit
    const b1 = computeNextLedgerBalance({
      partyType: 'SUPPLIER',
      previousBalance: '0.00',
      debit: '0.00',
      credit: '50000.00',
    });
    expect(b1.toFixed(2)).toBe('50000.00');

    // 2. Purchase invoice 110,000.00 credit
    const b2 = computeNextLedgerBalance({
      partyType: 'SUPPLIER',
      previousBalance: b1,
      debit: '0.00',
      credit: '110000.00',
    });
    expect(b2.toFixed(2)).toBe('160000.00');

    // 3. Payment Out 60,000.00 debit
    const b3 = computeNextLedgerBalance({
      partyType: 'SUPPLIER',
      previousBalance: b2,
      debit: '60000.00',
      credit: '0.00',
    });
    expect(b3.toFixed(2)).toBe('100000.00');

    // 4. Purchase Return (Debit Note) 11,000.00 debit
    const b4 = computeNextLedgerBalance({
      partyType: 'SUPPLIER',
      previousBalance: b3,
      debit: '11000.00',
      credit: '0.00',
    });
    expect(b4.toFixed(2)).toBe('89000.00');

    // 5. Reversal on voided payment (credit 60,000.00 back)
    const b5 = computeNextLedgerBalance({
      partyType: 'SUPPLIER',
      previousBalance: b4,
      debit: '0.00',
      credit: '60000.00',
    });
    expect(b5.toFixed(2)).toBe('149000.00');
  });

  it('computes client receivable balance: sale debit - payment credit - return credit', () => {
    const b1 = computeNextLedgerBalance({
      partyType: 'CLIENT',
      previousBalance: new Decimal(0),
      debit: '41550.00',
      credit: '0.00',
    });
    expect(b1.toFixed(2)).toBe('41550.00');

    const b2 = computeNextLedgerBalance({
      partyType: 'CLIENT',
      previousBalance: b1,
      debit: '0.00',
      credit: '20000.00',
    });
    expect(b2.toFixed(2)).toBe('21550.00');
  });
});
