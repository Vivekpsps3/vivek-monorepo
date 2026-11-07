/** CSV fixtures for the bank-import e2e (F9). */

export const chaseGood = [
  'Transaction Date,Description,Category,Type,Amount',
  '10/02/2026,GROCER,Food,SALE,-12.00',
  '10/03/2026,BAKERY,Food,SALE,-5.25',
  '10/04/2026,SHOE RETURN,Shopping,RETURN,3.25',
].join('\n');

/** Same bank, wrong columns: not a Chase export shape. */
export const chaseWrong = [
  'Foo,Bar,Baz',
  'one,two,three',
].join('\n');

/** Header only: parses to zero transactions. */
export const chaseEmpty = 'Transaction Date,Description,Category,Type,Amount';
