import { SavedSongFile, generateSongFileId } from './sourceFile';

export const SHARE_HASH_PARAM = 's';
export const SHARE_CODEC_V1 = 'v1';
export const MAX_SHARE_URL_LENGTH = 8000;
export const MAX_SHARE_TOKEN_LENGTH = 32768;
export const MAX_DECOMPRESSED_BYTES = 256 * 1024;

const BASE64_CHUNK_SIZE = 0x8000;

export interface SharedSongPayload {
  melody: string;
  lyrics: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    let binary = '';
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
    chunks.push(binary);
  }
  return btoa(chunks.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (!encoded || encoded.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new Error('分享連結無效或已損毀');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('分享連結無效或已損毀');
  }

  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('分享連結無效或已損毀');
  }

  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('此瀏覽器不支援壓縮分享連結，請改用「匯出原始檔 (.nmn)」');
  }

  let cs: CompressionStream;
  try {
    cs = new CompressionStream('deflate-raw');
  } catch {
    throw new Error('此瀏覽器不支援壓縮分享連結，請改用「匯出原始檔 (.nmn)」');
  }
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  const writeTask = (async () => {
    await writer.write(input as unknown as BufferSource);
    await writer.close();
  })();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  const readTask = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLen += value.byteLength;
      }
    }
  })();

  await Promise.all([writeTask, readTask]);

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function inflateRawWithLimit(
  compressed: Uint8Array,
  maxBytes: number = MAX_DECOMPRESSED_BYTES
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('此瀏覽器不支援解析分享連結，請改用「匯入原始檔 (.nmn)」');
  }

  let ds: DecompressionStream;
  try {
    ds = new DecompressionStream('deflate-raw');
  } catch {
    throw new Error('此瀏覽器不支援解析分享連結，請改用「匯入原始檔 (.nmn)」');
  }
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  let writeErr: unknown = null;
  const writeTask = (async () => {
    try {
      await writer.write(compressed as unknown as BufferSource);
      await writer.close();
    } catch (err) {
      writeErr = err;
    }
  })();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        totalLen += value.byteLength;
        if (totalLen > maxBytes) {
          await reader.cancel().catch(() => {});
          await writer.abort().catch(() => {});
          throw new Error('分享連結內容超過大小上限');
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    await writer.abort().catch(() => {});
    await writeTask;
    if (err instanceof Error && err.message === '分享連結內容超過大小上限') {
      throw err;
    }
    throw new Error('分享連結無效或已損毀');
  }

  await writeTask;
  if (writeErr) {
    throw new Error('分享連結無效或已損毀');
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Extracts the `s` share parameter from a URL hash (`#s=v1.<payload>`),
 * or returns `null` if no `s=` parameter is present.
 * Note: `#s=` returns `""` so callers can surface an invalid-link notice.
 */
export function extractShareParamFromHash(hash: string): string | null {
  if (!hash) return null;
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!stripped) return null;

  for (const segment of stripped.split('&')) {
    if (segment === `${SHARE_HASH_PARAM}=` || segment.startsWith(`${SHARE_HASH_PARAM}=`)) {
      const rawValue = segment.slice(SHARE_HASH_PARAM.length + 1);
      if (rawValue.includes('%')) {
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
      return rawValue;
    }
  }
  return null;
}

/**
 * Removes the `s=...` share parameter from a URL hash while preserving any unrelated hash segments.
 * Returns `""` when `s=...` was the only hash parameter.
 */
export function stripShareParamFromHash(hash: string): string {
  if (!hash) return '';
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!stripped) return '';

  const remaining = stripped
    .split('&')
    .filter(
      (segment) =>
        segment !== '' &&
        segment !== `${SHARE_HASH_PARAM}=` &&
        !segment.startsWith(`${SHARE_HASH_PARAM}=`)
    );
  return remaining.length > 0 ? `#${remaining.join('&')}` : '';
}

/**
 * Encodes `(melody, lyrics)` into `<version>.<payload>` where the outer version (`v1.`)
 * remains uncompressed in plain ASCII so future codecs can be dispatched before decompression.
 */
export async function encodeSharePayload(
  melody: string,
  lyrics: string,
  maxUncompressedBytes: number = MAX_DECOMPRESSED_BYTES
): Promise<string> {
  if (!melody.trim() && !lyrics.trim()) {
    throw new Error('簡譜內容為空白，無法產生分享連結');
  }
  const json = JSON.stringify([melody, lyrics]);
  const utf8Bytes = new TextEncoder().encode(json);
  if (utf8Bytes.byteLength > maxUncompressedBytes) {
    throw new Error('簡譜內容超過分享連結大小上限，請改用「匯出原始檔 (.nmn)」分享');
  }
  const compressed = await deflateRaw(utf8Bytes);
  return `${SHARE_CODEC_V1}.${bytesToBase64Url(compressed)}`;
}

/**
 * Builds a complete shareable URL (`<origin><pathname><search>#s=v1.<payload>`),
 * enforcing `MAX_SHARE_URL_LENGTH` so chat apps do not truncate the link.
 */
export async function buildShareUrl(
  melody: string,
  lyrics: string,
  baseHref?: string,
  maxUrlLength: number = MAX_SHARE_URL_LENGTH
): Promise<string> {
  const token = await encodeSharePayload(melody, lyrics);
  const resolvedBase = (
    baseHref ?? (typeof window !== 'undefined' ? window.location.href : '')
  ).split('#')[0];
  const url = `${resolvedBase}#${SHARE_HASH_PARAM}=${token}`;
  if (url.length > maxUrlLength) {
    throw new Error(
      `簡譜內容過長（連結共 ${url.length} 字元，上限 ${maxUrlLength} 字元），請改用「匯出原始檔 (.nmn)」分享`
    );
  }
  return url;
}

async function decodeV1Body(
  encodedBody: string,
  maxDecompressedBytes: number
): Promise<SharedSongPayload> {
  const compressed = base64UrlToBytes(encodedBody);
  const utf8Bytes = await inflateRawWithLimit(compressed, maxDecompressedBytes);

  let jsonText: string;
  try {
    jsonText = new TextDecoder('utf-8', { fatal: true }).decode(utf8Bytes);
  } catch {
    throw new Error('分享連結無效或已損毀');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('分享連結無效或已損毀');
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  ) {
    throw new Error('分享連結無效或已損毀');
  }

  const melody = parsed[0];
  const lyrics = parsed[1];
  if (!melody.trim() && !lyrics.trim()) {
    throw new Error('分享連結內容為空白');
  }

  return { melody, lyrics };
}

/**
 * Decodes a `<version>.<payload>` share token by inspecting the uncompressed outer version prefix
 * before invoking the version-specific decompressor.
 */
export async function decodeSharePayload(
  rawToken: string,
  maxDecompressedBytes: number = MAX_DECOMPRESSED_BYTES
): Promise<SharedSongPayload> {
  const trimmed = rawToken.trim();
  if (!trimmed || trimmed.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new Error('分享連結無效或已損毀');
  }

  const dotIdx = trimmed.indexOf('.');
  if (dotIdx <= 0) {
    throw new Error('分享連結無效或已損毀');
  }

  const version = trimmed.slice(0, dotIdx);
  const encodedBody = trimmed.slice(dotIdx + 1);

  if (version === SHARE_CODEC_V1) {
    return decodeV1Body(encodedBody, maxDecompressedBytes);
  }

  if (/^v[1-9]\d*$/.test(version)) {
    throw new Error(`此分享連結版本較新 (${version})，請重新整理頁面以載入最新版本`);
  }

  throw new Error('分享連結無效或已損毀');
}

/**
 * Maps a decoded shared song onto the recipient's saved workspace:
 * - Reuses an existing `SavedSongFile` if `(melody, lyrics)` already matches
 *   (preventing duplicates when clicking the same link multiple times).
 * - Otherwise allocates a new `fileId` so existing saved songs remain untouched.
 */
export function resolveSharedSongTarget(
  savedFiles: SavedSongFile[],
  payload: SharedSongPayload,
  createId: () => string = generateSongFileId
): { fileId: string; melody: string; lyrics: string; reusedExisting: boolean } {
  const existing = savedFiles.find(
    (f) => f.melody === payload.melody && f.lyrics === payload.lyrics
  );
  if (existing) {
    return {
      fileId: existing.id,
      melody: existing.melody,
      lyrics: existing.lyrics,
      reusedExisting: true,
    };
  }
  return {
    fileId: createId(),
    melody: payload.melody,
    lyrics: payload.lyrics,
    reusedExisting: false,
  };
}
