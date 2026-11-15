import {
importFileError,
undoConfirmBody
} from './bank-import-copy';

describe('bank-import-copy', () => {

  it('never surfaces raw or stack-shaped errors', () => {
    const raw = 'TypeError: Cannot read properties of undefined\n    at parse (bank.ts:10:5)';
    expect(importFileError(raw)).toBe("That file couldn't be read. Download a fresh CSV from your bank and try again.");
    expect(importFileError('x'.repeat(300))).toBe(importFileError(raw));
    expect(importFileError('')).toBe('');
    expect(importFileError(null)).toBe('');
  });

  it('builds the undo confirm body from counts, omitting zero clauses', () => {
    expect(undoConfirmBody({ removable: 3, editedKept: 1, alreadyGone: 2 }))
      .toBe('Remove 3 transactions this import added. 1 transaction you edited will stay. 2 transactions are already gone. This also removes the statement coverage this import confirmed.');
    expect(undoConfirmBody({ removable: 0, editedKept: 0, alreadyGone: 0 }))
      .toBe('Nothing from this import is left to remove. This also removes the statement coverage this import confirmed.');
    expect(undoConfirmBody({ removable: 1, editedKept: 0, alreadyGone: 0 }))
      .toBe('Remove 1 transaction this import added. This also removes the statement coverage this import confirmed.');
  });

});
