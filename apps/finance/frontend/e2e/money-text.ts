/** Match formatted money that may include U+2060 word joiners. */
export function moneyText(sample: string): RegExp {
  const escaped = sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    escaped
      .replaceAll('−', '−\\u2060?')
      .replaceAll('\\+', '\\+\\u2060?')
      .replaceAll('\\$', '\\$\\u2060?'),
  );
}
