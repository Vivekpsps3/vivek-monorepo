/** Existing transaction dedupe policy, shared by ordinary persistence and restore. */
export async function recordIndexes(
  vault: { blindIndex(value: string): Promise<string> },
  collection: string,
  value: unknown,
): Promise<Array<{ index_name: string; index_value_b64: string }>> {
  const dedupe = value && typeof value === 'object' && 'dedupe_key' in value ? value.dedupe_key : undefined;
  return collection === 'transactions' && dedupe
    ? [{ index_name: 'dedupe_key', index_value_b64: await vault.blindIndex(String(dedupe)) }]
    : [];
}
