import { describe, expect, it } from 'vitest';
import { computeNextGridCell } from './line-item-grid.js';
import { matchesHotkey } from '../hooks/use-hotkeys.js';

describe('computeNextGridCell (spreadsheet line-item grid navigation)', () => {
  it('moves right to the next editable cell in the same row', () => {
    expect(computeNextGridCell({ rowIndex: 0, colIndex: 1 }, 2, 4)).toEqual({
      next: { rowIndex: 0, colIndex: 2 },
      shouldAddRow: false,
    });
  });

  it('wraps to the first cell of the next row at the end of a row', () => {
    expect(computeNextGridCell({ rowIndex: 0, colIndex: 3 }, 2, 4)).toEqual({
      next: { rowIndex: 1, colIndex: 0 },
      shouldAddRow: false,
    });
  });

  it('appends a new row when pressing Enter on the last editable cell of the last row', () => {
    expect(computeNextGridCell({ rowIndex: 1, colIndex: 3 }, 2, 4)).toEqual({
      next: { rowIndex: 2, colIndex: 0 },
      shouldAddRow: true,
    });
  });

  it('moves backward on Shift+Enter', () => {
    expect(computeNextGridCell({ rowIndex: 1, colIndex: 0 }, 2, 4, true)).toEqual({
      next: { rowIndex: 0, colIndex: 3 },
      shouldAddRow: false,
    });
  });
});

describe('matchesHotkey', () => {
  it('matches Ctrl+B and Ctrl+S case-insensitively', () => {
    expect(
      matchesHotkey(
        { key: 'B', ctrlKey: true, metaKey: false, altKey: false },
        { key: 'b', ctrlOrMeta: true },
      ),
    ).toBe(true);
    expect(
      matchesHotkey(
        { key: 's', ctrlKey: false, metaKey: true, altKey: false },
        { key: 's', ctrlOrMeta: true },
      ),
    ).toBe(true);
  });

  it('does not match when modifier state differs', () => {
    expect(
      matchesHotkey(
        { key: 'n', ctrlKey: false, metaKey: false, altKey: false },
        { key: 'n', ctrlOrMeta: true },
      ),
    ).toBe(false);
    expect(
      matchesHotkey(
        { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false },
        { key: 'Escape', ctrlOrMeta: false },
      ),
    ).toBe(true);
  });
});
