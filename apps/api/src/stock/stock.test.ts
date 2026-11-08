import { describe, expect, it } from 'vitest';
import { verifyAndSumStockMovements } from './stock.module.js';

describe('StockService pure stock movement verification', () => {
  it('adds purchase stock and subtracts returns accurately to 3 decimal places', () => {
    const afterPurchase = verifyAndSumStockMovements('0.000', '500.000');
    expect(afterPurchase.toFixed(3)).toBe('500.000');

    const afterReturn = verifyAndSumStockMovements(afterPurchase, '-50.250');
    expect(afterReturn.toFixed(3)).toBe('449.750');
  });

  it('blocks any movement that would cause stock to become negative', () => {
    expect(() => verifyAndSumStockMovements('100.000', '-100.001')).toThrow(/Insufficient stock/);
  });
});
