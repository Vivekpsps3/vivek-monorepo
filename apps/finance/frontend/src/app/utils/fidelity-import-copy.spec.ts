import {
  fidelityConfirmBody, fidelityImportError, fidelityImportToast, fidelityReplaceLine,
} from './fidelity-import-copy';

describe('Fidelity import copy', () => {
  it('names missing Symbol and Quantity instead of displaying parser jargon', () => {
    expect(fidelityImportError('Missing required columns: symbol, quantity'))
      .toBe("This isn't a Fidelity positions export. It's missing Symbol and Quantity. In Fidelity, open Positions and download the CSV export.");
  });

  it('names a single missing column and all three required columns', () => {
    expect(fidelityImportError('Missing required columns: quantity')).toContain("It's missing Quantity.");
    expect(fidelityImportError('Missing required columns: account number, quantity, symbol'))
      .toContain("It's missing Account Number, Quantity and Symbol.");
  });

  it('uses the generic export sentence for null, empty, and an empty CSV', () => {
    for (const message of [null, undefined, '', 'CSV file is empty']) {
      expect(fidelityImportError(message))
        .toBe("This isn't a Fidelity positions export. In Fidelity, open Positions and download the CSV export.");
    }
    expect(fidelityImportError('No positions')).toContain('It has no positions to import.');
  });

  it('does not expose arbitrary errors or unrecognized column names', () => {
    for (const message of ['private file contents', 'Missing required columns: private file contents',
      'Missing required columns: constructor', 'Missing required columns: __proto__']) {
      expect(fidelityImportError(message)).toBe("Couldn't read this file. Try downloading your Fidelity positions export again.");
    }
  });

  it('formats replacement counts, dollars, and incomplete values', () => {
    expect(fidelityReplaceLine(2, 1250, 1)).toBe('2 positions · $\u20601,250.00 · replaces your 1 Fidelity holding');
    expect(fidelityReplaceLine(1, 12.34, 2)).toBe('1 position · $\u206012.34 · replaces your 2 Fidelity holdings');
    expect(fidelityReplaceLine(2, 0, 0)).toBe('2 positions · $\u20600.00 · replaces your 0 Fidelity holdings');
    expect(fidelityReplaceLine(2, null, 1)).toBe('2 positions · Value incomplete · replaces your 1 Fidelity holding');
  });

  it('explains the replacement scope in the confirmation', () => {
    expect(fidelityConfirmBody(2, 1)).toBe('2 positions replace your 1 Fidelity holding. Manual holdings stay.');
    expect(fidelityConfirmBody(1, 0)).toBe('1 position replaces your 0 Fidelity holdings. Manual holdings stay.');
  });

  it('uses the imported count in the success toast', () => {
    expect(fidelityImportToast(2)).toBe('Imported 2 Fidelity positions');
    expect(fidelityImportToast(1)).toBe('Imported 1 Fidelity position');
  });
});
