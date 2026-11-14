import {
  DEFAULT_PBKDF2_ITERATIONS, decodeBase64, decryptPackedAesGcm,
  derivePbkdf2AesGcmKey, encodeBase64, encryptPackedAesGcm, randomBytes,
} from '@vivek/browser';

export const RECOVERY_LIMITS = Object.freeze({ records: 10_000, collections: 64, recordBytes: 512_000, plainBytes: 16 * 1024 * 1024, fileBytes: 24 * 1024 * 1024 });
export interface RecoveryCollection { collection: string; schema_versions: number[]; count: number }
export interface RecoveryRecord { collection: string; client_id: string; schema_version: number; key_version: number; value: unknown }
export interface RecoveryBundle { collections: RecoveryCollection[]; records: RecoveryRecord[] }
interface RecoveryHeader { format: 'vivek-vault-recovery'; version: 1; created_at: string; kdf: 'PBKDF2-SHA256'; iterations: number; salt_b64: string; cipher: 'AES-256-GCM' }
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export class RecoveryError extends Error {
  constructor(message: string) { super(message); this.name = 'RecoveryError'; }
}
function refuse(message = 'Unsupported or corrupt recovery data. Update the app or use another backup.'): never { throw new RecoveryError(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) refuse();
}
function integer(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
export function validateRecoveryCollections(value: unknown): RecoveryCollection[] {
  if (!Array.isArray(value) || !value.length || value.length > RECOVERY_LIMITS.collections) refuse();
  const seen = new Set<string>();
  let total = 0;
  for (const item of value) {
    const row = object(item);
    exact(row, ['collection', 'schema_versions', 'count']);
    if (typeof row['collection'] !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(row['collection']) || seen.has(row['collection'])) refuse();
    seen.add(row['collection']);
    const versions = row['schema_versions'];
    if (!Array.isArray(versions) || !versions.length || versions.length > 2 || versions.some(version => version !== 1 && version !== 2) || new Set(versions).size !== versions.length) refuse();
    if (!integer(row['count'], 0, RECOVERY_LIMITS.records)) refuse();
    total += row['count'];
  }
  if (total > RECOVERY_LIMITS.records) refuse('Vault exceeds the 10,000-record recovery limit. No partial backup was created.');
  return value as RecoveryCollection[];
}
export function validateRecoveryBundle(value: unknown): RecoveryBundle {
  const body = object(value);
  exact(body, ['collections', 'records']);
  const collections = validateRecoveryCollections(body['collections']);
  const records = body['records'];
  if (!Array.isArray(records) || records.length > RECOVERY_LIMITS.records) refuse();
  const policy = new Map(collections.map(row => [row.collection, row]));
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  let size = 0;
  for (const item of records) {
    const row = object(item);
    exact(row, ['collection', 'client_id', 'schema_version', 'key_version', 'value']);
    const descriptor = typeof row['collection'] === 'string' ? policy.get(row['collection']) : undefined;
    if (!descriptor || !descriptor.schema_versions.includes(row['schema_version'] as number)) refuse();
    if (typeof row['client_id'] !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(row['client_id']) || !integer(row['key_version'], 1, 2_147_483_647)) refuse();
    object(row['value']);
    const key = `${row['collection']}/${row['client_id']}`;
    if (ids.has(key)) refuse('Backup contains duplicate record IDs. No partial backup was created.');
    ids.add(key);
    const bytes = encoder.encode(JSON.stringify(row)).byteLength;
    size += bytes;
    if (bytes > RECOVERY_LIMITS.recordBytes || size > RECOVERY_LIMITS.plainBytes) refuse('Vault exceeds the portable recovery size limit. No partial backup was created.');
    counts.set(descriptor.collection, (counts.get(descriptor.collection) ?? 0) + 1);
  }
  if (collections.some(row => row.count !== (counts.get(row.collection) ?? 0))) refuse('Backup counts do not match its records. No partial backup was created.');
  return value as RecoveryBundle;
}
function checkPassword(password: string): void {
  if (password.length < 12 || password.length > 1024) refuse('Use a backup password of 12–1,024 characters.');
}
/** Header fields use a fixed order for AES-GCM additional authenticated data. */
function aad(header: RecoveryHeader): Uint8Array {
  return encoder.encode(JSON.stringify([header.format, header.version, header.created_at, header.kdf, header.iterations, header.salt_b64, header.cipher]));
}
export async function encodeRecoveryBundle(bundle: RecoveryBundle, password: string, check: () => void = () => undefined, signal?: AbortSignal): Promise<string> {
  checkPassword(password);
  check();
  validateRecoveryBundle(bundle);
  const bytes = encoder.encode(JSON.stringify(bundle));
  const clear = (): void => { bytes.fill(0); };
  signal?.addEventListener('abort', clear, { once: true });
  try {
    check();
    if (bytes.byteLength > RECOVERY_LIMITS.plainBytes) refuse('Vault exceeds the 16 MiB recovery limit. No partial backup was created.');
    const header: RecoveryHeader = { format: 'vivek-vault-recovery', version: 1, created_at: new Date().toISOString(), kdf: 'PBKDF2-SHA256', iterations: DEFAULT_PBKDF2_ITERATIONS, salt_b64: encodeBase64(randomBytes(16)), cipher: 'AES-256-GCM' };
    const key = await derivePbkdf2AesGcmKey(password, decodeBase64(header.salt_b64), header.iterations);
    check();
    const ciphertext_b64 = await encryptPackedAesGcm(bytes, key, aad(header));
    check();
    return JSON.stringify({ header, ciphertext_b64 });
  } finally { clear(); signal?.removeEventListener('abort', clear); }
}
/** Local decoder for the version-1 compatibility contract; restore owns writes. */
export async function decodeRecoveryBundle(file: string, password: string, check: () => void = () => undefined): Promise<RecoveryBundle> {
  checkPassword(password);
  check();
  if (file.length > RECOVERY_LIMITS.fileBytes || encoder.encode(file).byteLength > RECOVERY_LIMITS.fileBytes) refuse('Backup exceeds the 24 MiB file limit.');
  let bytes: Uint8Array | undefined;
  try {
    const outer = object(JSON.parse(file));
    exact(outer, ['header', 'ciphertext_b64']);
    const h = object(outer['header']);
    exact(h, ['format', 'version', 'created_at', 'kdf', 'iterations', 'salt_b64', 'cipher']);
    if (h['format'] !== 'vivek-vault-recovery' || h['version'] !== 1 || h['kdf'] !== 'PBKDF2-SHA256' || h['cipher'] !== 'AES-256-GCM' || !integer(h['iterations'], DEFAULT_PBKDF2_ITERATIONS, DEFAULT_PBKDF2_ITERATIONS)) refuse();
    if (typeof h['created_at'] !== 'string' || h['created_at'].length !== 24 || new Date(h['created_at']).toISOString() !== h['created_at'] || typeof h['salt_b64'] !== 'string' || decodeBase64(h['salt_b64']).length !== 16) refuse();
    const packed = outer['ciphertext_b64'];
    if (typeof packed !== 'string' || packed.length > 4 * Math.ceil((RECOVERY_LIMITS.plainBytes + 28) / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(packed)) refuse();
    const header = h as unknown as RecoveryHeader;
    const key = await derivePbkdf2AesGcmKey(password, decodeBase64(header.salt_b64), header.iterations);
    check();
    bytes = new Uint8Array(await decryptPackedAesGcm(packed, key, aad(header)));
    check();
    if (bytes.byteLength > RECOVERY_LIMITS.plainBytes) refuse();
    return validateRecoveryBundle(JSON.parse(decoder.decode(bytes)));
  } catch (error) {
    check();
    if (error instanceof RecoveryError) throw error;
    return refuse('Cannot open this backup. Check the backup password and file; it may be damaged.');
  } finally { bytes?.fill(0); }
}
