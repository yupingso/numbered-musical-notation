import { SongMetadata } from './types';

export interface NmnSourceFile {
  version: 1;
  melody: string;
  lyrics: string;
}

/**
 * Serializes melodyText and lyricsText into a structured .nmn JSON string.
 */
export function serializeNmnSource(melody: string, lyrics: string): string {
  const payload: NmnSourceFile = {
    version: 1,
    melody,
    lyrics,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

/**
 * Parses and validates a .nmn source file string, returning { melody, lyrics }.
 * Throws a descriptive Error in Traditional Chinese if invalid.
 */
export function parseNmnSource(content: string): { melody: string; lyrics: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('無效的 .nmn 原始檔格式（非合法的 JSON 結構）');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).melody !== 'string' ||
    typeof (parsed as Record<string, unknown>).lyrics !== 'string'
  ) {
    throw new Error('無效的 .nmn 原始檔：缺少旋律 (melody) 或歌詞 (lyrics) 欄位');
  }

  const obj = parsed as Record<string, string>;
  return {
    melody: obj.melody,
    lyrics: obj.lyrics,
  };
}

/**
 * Derives a safe filename stem from song metadata <title>, falling back to defaultStem.
 */
export function getSongFileStem(
  metadata?: SongMetadata,
  defaultStem: string = 'nmn_song'
): string {
  const rawTitle = metadata?.title?.split(/\\n|\r?\n/)[0]?.trim();
  if (!rawTitle) return defaultStem;
  const sanitized = rawTitle.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return sanitized || defaultStem;
}
