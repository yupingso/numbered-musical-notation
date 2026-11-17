import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MAX_SHARE_URL_LENGTH,
  SHARE_CODEC_V1,
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
  extractShareParamFromHash,
  resolveSharedSongTarget,
  stripShareParamFromHash,
} from '../src/core/shareUrl';
import { syncAutoSaveFile } from '../src/core/sourceFile';

describe('shareUrl (#s=v1.<payload>)', () => {
  it('encodes with uncompressed v1. prefix and round-trips melody + lyrics losslessly', async () => {
    const melody = `<key> G\n<time> 4/4\n| 1 2 3_ 5_ | 6 - 5 - |\n`;
    const lyrics = `<title> 範例歌曲\n<credits> 詞：王小明\\n曲：林大華\n<tag> 主歌\n春風吹過山崗𠮷\n`;

    const token = await encodeSharePayload(melody, lyrics);
    expect(token.startsWith(`${SHARE_CODEC_V1}.`)).toBe(true);

    const body = token.slice(SHARE_CODEC_V1.length + 1);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);

    const decoded = await decodeSharePayload(token);
    expect(decoded).toEqual({ melody, lyrics });
  });

  it('supports work-in-progress songs with only melody or only lyrics, and rejects blank songs', async () => {
    const melodyOnly = await encodeSharePayload('<key> C\n| 1 2 3 4 |', '   ');
    expect(await decodeSharePayload(melodyOnly)).toEqual({
      melody: '<key> C\n| 1 2 3 4 |',
      lyrics: '   ',
    });

    const lyricsOnly = await encodeSharePayload('', '<title> 草稿標題\n一二三四');
    expect(await decodeSharePayload(lyricsOnly)).toEqual({
      melody: '',
      lyrics: '<title> 草稿標題\n一二三四',
    });

    await expect(encodeSharePayload('   ', '\n\t')).rejects.toThrow(/空白/);
  });

  it('builds full share URLs preserving path/query, replacing old hash, and enforcing max length', async () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<title> 測試曲\n<tag> 主歌\n一二三四`;

    const url = await buildShareUrl(
      melody,
      lyrics,
      'https://example.com/numbered-musical-notation/?lang=zh#old-hash'
    );
    expect(url.startsWith('https://example.com/numbered-musical-notation/?lang=zh#s=v1.')).toBe(
      true
    );
    expect(url.length).toBeLessThan(MAX_SHARE_URL_LENGTH);

    const hash = url.slice(url.indexOf('#'));
    const extracted = extractShareParamFromHash(hash);
    expect(extracted).not.toBeNull();
    expect(await decodeSharePayload(extracted!)).toEqual({ melody, lyrics });

    await expect(
      buildShareUrl(melody, lyrics, 'https://example.com/app', 60)
    ).rejects.toThrow(/過長/);
  });

  it('dispatches uncompressed outer version before decompression and reports newer versions clearly', async () => {
    // Future v2/v12 token with non-deflate payload is caught by version check before decompression
    await expect(decodeSharePayload('v2.not_deflate_at_all')).rejects.toThrow(/版本較新 \(v2\)/);
    await expect(decodeSharePayload('v12.future_codec_payload')).rejects.toThrow(
      /版本較新 \(v12\)/
    );

    // Malformed outer framing or corrupted v1 payloads fail cleanly
    await expect(decodeSharePayload('')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('no_dot_separator')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('.missing_version')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('v0.invalid_zero')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('x1.unknown_prefix')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('v1.')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('v1.a')).rejects.toThrow(/無效或已損毀/); // len % 4 === 1
    await expect(decodeSharePayload('v1.bad+slash/char')).rejects.toThrow(/無效或已損毀/);
    await expect(decodeSharePayload('v1.AAAAAAAA')).rejects.toThrow(/無效或已損毀/);
  });

  it('enforces maxDecompressedBytes symmetrically on encode and decode', async () => {
    const repeatedLyrics = `<title> 長曲測試\n${'甲乙丙丁戊己庚辛\n'.repeat(200)}`;
    const token = await encodeSharePayload('<key> C\n| 1 2 3 4 |', repeatedLyrics);

    await expect(decodeSharePayload(token, 256)).rejects.toThrow(/超過大小上限/);
    const full = await decodeSharePayload(token);
    expect(full.lyrics).toBe(repeatedLyrics);

    // Highly compressible input > MAX_DECOMPRESSED_BYTES (256 KiB) is rejected at encode time
    // instead of minting a short link that decodeSharePayload would later reject
    const hugeRepetitiveLyrics = '甲'.repeat(100_000); // ~300 KB UTF-8
    await expect(
      buildShareUrl('<key> C\n| 1 2 3 4 |', hugeRepetitiveLyrics, 'https://example.com/')
    ).rejects.toThrow(/大小上限/);
  });

  it('extracts and strips s= from URL hashes while preserving unrelated hash parameters', () => {
    expect(extractShareParamFromHash('')).toBeNull();
    expect(extractShareParamFromHash('#')).toBeNull();
    expect(extractShareParamFromHash('#section-2')).toBeNull();
    expect(extractShareParamFromHash('#s=')).toBe('');
    expect(extractShareParamFromHash('#s=v1.abc_123-XYZ')).toBe('v1.abc_123-XYZ');
    expect(extractShareParamFromHash('#foo=1&s=v1%2Eabc&bar=2')).toBe('v1.abc');

    expect(stripShareParamFromHash('#s=v1.abc_123')).toBe('');
    expect(stripShareParamFromHash('#s=')).toBe('');
    expect(stripShareParamFromHash('#foo=1&s=v1.abc&bar=2')).toBe('#foo=1&bar=2');
    expect(stripShareParamFromHash('#section-2')).toBe('#section-2');
  });

  it('deduplicates identical shared songs and preserves existing & edited local songs (Approach A)', () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    // 1. Recipient already has their own saved song
    let savedFiles = syncAutoSaveFile({
      savedFiles: [],
      activeFileId: 'file_local_1',
      melody: '<key> D\n| 5 6 7 1 |',
      lyrics: '<title> 本地歌曲\n<tag> 主歌\n一二三四',
      isExampleSession: false,
      now: 1000,
      storage: mockStorage,
    });
    expect(savedFiles).toHaveLength(1);

    // 2. Recipient opens a shared link -> creates a new entry without overwriting file_local_1
    const sharedPayload = {
      melody: '<key> F\n| 1 2 3 5 |',
      lyrics: '<title> 朋友分享曲\n<tag> 主歌\n甲乙丙丁',
    };
    const open1 = resolveSharedSongTarget(savedFiles, sharedPayload, () => 'file_shared_1');
    expect(open1.reusedExisting).toBe(false);
    expect(open1.fileId).toBe('file_shared_1');

    savedFiles = syncAutoSaveFile({
      savedFiles,
      activeFileId: open1.fileId,
      melody: open1.melody,
      lyrics: open1.lyrics,
      isExampleSession: false,
      now: 2000,
      storage: mockStorage,
    });
    expect(savedFiles).toHaveLength(2);
    expect(savedFiles.map((f) => f.id)).toEqual(['file_shared_1', 'file_local_1']);

    // 3. Clicking the exact same shared link again reuses file_shared_1 (no duplicate slot)
    const open2 = resolveSharedSongTarget(savedFiles, sharedPayload, () => 'file_shared_dup');
    expect(open2.reusedExisting).toBe(true);
    expect(open2.fileId).toBe('file_shared_1');

    // 4. Recipient edits file_shared_1 locally, then clicks the original shared link again ->
    //    allocates a fresh copy instead of overwriting the recipient's edited version
    savedFiles = syncAutoSaveFile({
      savedFiles,
      activeFileId: 'file_shared_1',
      melody: '<key> F\n| 1 2 3 6 |',
      lyrics: '<title> 朋友分享曲\n<tag> 主歌\n甲乙丙丁',
      isExampleSession: false,
      now: 3000,
      storage: mockStorage,
    });
    const open3 = resolveSharedSongTarget(savedFiles, sharedPayload, () => 'file_shared_2');
    expect(open3.reusedExisting).toBe(false);
    expect(open3.fileId).toBe('file_shared_2');
  });

  it('round-trips full repository songs well within URL length limits', async () => {
    const songsDir = path.resolve(__dirname, '../../songs');
    for (const dirName of ['song01', 'song19']) {
      const dir = path.join(songsDir, dirName);
      if (!fs.existsSync(dir)) continue;
      const melody = fs.readFileSync(path.join(dir, 'melody.txt'), 'utf-8');
      const lyrics = fs.readFileSync(path.join(dir, 'lyrics.txt'), 'utf-8');
      const url = await buildShareUrl(
        melody,
        lyrics,
        'https://example.github.io/numbered-musical-notation/'
      );
      expect(url.length).toBeLessThan(1200);
      const param = extractShareParamFromHash(url.slice(url.indexOf('#')));
      expect(await decodeSharePayload(param!)).toEqual({ melody, lyrics });
    }
  });
});
