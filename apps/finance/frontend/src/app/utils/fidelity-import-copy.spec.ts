import {
fidelityConfirmBody,fidelityImportError
} from './fidelity-import-copy';

describe('Fidelity import copy', () => {

  it('uses the generic export sentence for null, empty, and an empty CSV', () => {
    for (const message of [null, undefined, '', 'CSV file is empty']) {
      expect(fidelityImportError(message))
        .toBe("This isn't a Fidelity positions export. In Fidelity, open Positions and download the CSV export.");
    }
    expect(fidelityImportError('No positions')).toContain('It has no positions to import.');
  });

  it('explains the replacement scope in the confirmation', () => {
    expect(fidelityConfirmBody(2, 1)).toBe('2 positions replace your 1 Fidelity holding. Manual holdings stay.');
    expect(fidelityConfirmBody(1, 0)).toBe('1 position replaces your 0 Fidelity holdings. Manual holdings stay.');
  });

});
