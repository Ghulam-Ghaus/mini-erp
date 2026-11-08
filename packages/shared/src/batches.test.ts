import { describe, expect, it } from 'vitest';
import {
  calculateAllocationAmount,
  calculateBatchMetrics,
  calculateBatchVariance,
} from './batches.js';

describe('Phase 4 Batch Costing & Wastage Math', () => {
  it('computes purchase allocation amount accurately using Decimal math', () => {
    expect(calculateAllocationAmount('500.000', '65.5000')).toBe('32750.00');
    expect(calculateAllocationAmount('249.500', '110.2500')).toBe('27507.38');
  });

  it('computes batch cost per kg when wastage is entered as percentage', () => {
    // 1000 kg @ 65.00/kg = 65,000.00 raw cost
    // Extra labour + packing = 2,000 + 1,250 = 3,250.00
    // Total batch cost = 68,250.00
    // Wastage = 2.5% -> 25.000 kg -> Output = 975.000 kg
    // Cost per kg = 68,250.00 / 975.000 = 70.00
    const metrics = calculateBatchMetrics({
      allocations: [
        { kgUsed: '600.000', amount: '39000.00' },
        { kgUsed: '400.000', amount: '26000.00' },
      ],
      activeCosts: [{ amount: '2000.00' }, { amount: '1250.00' }],
      wastageMode: 'PERCENT',
      wastagePercent: '2.500',
    });

    expect(metrics).toEqual({
      rawKg: '1000.000',
      wastagePercent: '2.500',
      wastageKg: '25.000',
      outputKg: '975.000',
      rawCost: '65000.00',
      extraCost: '3250.00',
      totalCost: '68250.00',
      costPerKg: '70.00',
    });
  });

  it('computes batch cost per kg and wastage % when wastage is entered in kg', () => {
    // 500 kg raw, 20 kg wastage (4.000%), output = 480 kg
    // Raw cost = 48,000.00, extra cost = 1,920.00 -> total = 49,920.00
    // Cost per kg = 49,920 / 480 = 104.00
    const metrics = calculateBatchMetrics({
      allocations: [{ kgUsed: '500.000', amount: '48000.00' }],
      activeCosts: [{ amount: '1920.00' }],
      wastageMode: 'KG',
      wastageKg: '20.000',
    });

    expect(metrics).toEqual({
      rawKg: '500.000',
      wastagePercent: '4.000',
      wastageKg: '20.000',
      outputKg: '480.000',
      rawCost: '48000.00',
      extraCost: '1920.00',
      totalCost: '49920.00',
      costPerKg: '104.00',
    });
  });

  it('rejects wastage >= 100% or wastageKg >= rawKg', () => {
    expect(() =>
      calculateBatchMetrics({
        allocations: [{ kgUsed: '100.000', amount: '10000.00' }],
        activeCosts: [],
        wastageMode: 'PERCENT',
        wastagePercent: '100.000',
      }),
    ).toThrow(/Wastage percent/);

    expect(() =>
      calculateBatchMetrics({
        allocations: [{ kgUsed: '100.000', amount: '10000.00' }],
        activeCosts: [],
        wastageMode: 'KG',
        wastageKg: '100.000',
      }),
    ).toThrow(/Wastage kg/);
  });

  it('computes planned vs actual wastage variance when closing a batch', () => {
    const variance = calculateBatchVariance({
      rawKg: '1000.000',
      plannedWastagePercent: '2.000',
      plannedWastageKg: '20.000',
      actualWastagePercent: '2.500',
      actualWastageKg: '25.000',
      actualOutputKg: '975.000',
    });

    expect(variance).toEqual({
      plannedWastagePercent: '2.000',
      plannedWastageKg: '20.000',
      actualWastagePercent: '2.500',
      actualWastageKg: '25.000',
      wastageDiffKg: '5.000',
      plannedOutputKg: '980.000',
      actualOutputKg: '975.000',
    });
  });
});
