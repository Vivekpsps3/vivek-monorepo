import { downloadCsv } from '@vivek/browser';

describe('browser CSV export', () => {
  it('quotes headers and escapes quotes, commas, and line breaks', async () => {
    const createObjectUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:finance-export');
    const revokeObjectUrl = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click');

    downloadCsv('transactions.csv', ['Account, name', 'Memo "text"'], [['Checking', 'Line 1\nLine 2, "quoted"']]);

    const blob = createObjectUrl.calls.mostRecent().args[0] as Blob;
    expect(await blob.text()).toBe('"Account, name","Memo ""text"""\n"Checking","Line 1\nLine 2, ""quoted"""\n');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:finance-export');
  });
});
