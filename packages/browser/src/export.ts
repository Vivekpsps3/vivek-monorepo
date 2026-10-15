function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  let csv = headers.map(csvCell).join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(csvCell).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
