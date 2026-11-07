/** CSV fixtures for the bank-import e2e (F9). Shapes match the real Chase
 * credit-card export the client parser requires (see bank-import.parsers:
 * Transaction Date, Post Date, Description, Category, Type, Amount, Memo). */

export const chaseGood = [
  'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
  '10/02/2026,10/02/2026,GROCER,Food,Sale,-12.00,',
  '10/03/2026,10/03/2026,BAKERY,Food,Sale,-5.25,',
  '10/04/2026,10/04/2026,SHOE RETURN,Shopping,Return,3.25,',
].join('\n');

/** Same bank, wrong columns: not a Chase export shape. */
export const chaseWrong = [
  'Foo,Bar,Baz',
  'one,two,three',
].join('\n');

/** Completely empty file: the parser's "CSV file is empty" case. */
export const chaseEmpty = '';
