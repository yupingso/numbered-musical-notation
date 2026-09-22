import { EXAMPLE_SONG_01, LEGACY_EXAMPLE_SONG_01_LYRICS } from '../examples';
import { parseSongMetadata } from './parserClassic';
import { SongMetadata } from './types';

export interface NmnSourceFile {
  version: 1;
  melody: string;
  lyrics: string;
}

export interface SavedSongFile {
  id: string;
  title: string;
  melody: string;
  lyrics: string;
  updatedAt: number;
}

export const STORAGE_KEY_FILES = 'nmn_saved_files';
export const STORAGE_KEY_ACTIVE_ID = 'nmn_active_file_id';
export const MAX_SAVED_FILES = 20;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Generates a unique immutable file ID for a song workspace entry.
 */
export function generateSongFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Returns true if the given melody and lyrics match the untouched built-in example song.
 */
export function isExactExampleSong(melody: string, lyrics: string): boolean {
  if (melody !== EXAMPLE_SONG_01.melody) return false;
  return lyrics === EXAMPLE_SONG_01.lyrics || lyrics === LEGACY_EXAMPLE_SONG_01_LYRICS;
}

/**
 * Extracts the single-line display title synchronously from lyrics/melody metadata.
 */
export function extractDisplayTitle(lyrics: string, melody: string = ''): string {
  const meta = parseSongMetadata(lyrics, melody);
  const firstLine = meta.title?.split(/\\n|\r?\n/)[0]?.trim();
  return firstLine || '';
}

/**
 * Creates the pre-filled melody and lyrics template for a newly created song.
 */
export function createNewSongTemplate(title: string): { melody: string; lyrics: string } {
  const cleanTitle = title.trim() || '未命名簡譜';
  return {
    melody: '<key> C\n<time> 4/4\n\n',
    lyrics: `<title> ${cleanTitle}\n\n<tag> 主歌\n\n\n<tag> 副歌\n\n`,
  };
}

/**
 * Loads the initial workspace state from localStorage, migrating legacy single-slot keys if needed.
 */
export function loadWorkspaceFromStorage(
  storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): {
  savedFiles: SavedSongFile[];
  activeFileId: string;
  initialMelody: string;
  initialLyrics: string;
} {
  const fallbackId = generateSongFileId();
  if (!storage) {
    return {
      savedFiles: [],
      activeFileId: fallbackId,
      initialMelody: EXAMPLE_SONG_01.melody,
      initialLyrics: EXAMPLE_SONG_01.lyrics,
    };
  }

  const rawFilesJson = storage.getItem(STORAGE_KEY_FILES);
  const storedActiveId = storage.getItem(STORAGE_KEY_ACTIVE_ID);

  // Legacy migration path when nmn_saved_files has never been initialized
  if (rawFilesJson === null) {
    const legacyMelody = storage.getItem('nmn_melody');
    const legacyLyrics = storage.getItem('nmn_lyrics');

    if (
      legacyMelody !== null &&
      legacyLyrics !== null &&
      (legacyMelody.trim() !== '' || legacyLyrics.trim() !== '') &&
      !isExactExampleSong(legacyMelody, legacyLyrics)
    ) {
      const migratedFile: SavedSongFile = {
        id: storedActiveId || fallbackId,
        title: extractDisplayTitle(legacyLyrics, legacyMelody),
        melody: legacyMelody,
        lyrics: legacyLyrics,
        updatedAt: Date.now(),
      };
      const savedFiles = [migratedFile];
      try {
        storage.setItem(STORAGE_KEY_FILES, JSON.stringify(savedFiles));
        storage.setItem(STORAGE_KEY_ACTIVE_ID, migratedFile.id);
      } catch {
        // Ignore storage quota errors
      }
      return {
        savedFiles,
        activeFileId: migratedFile.id,
        initialMelody: migratedFile.melody,
        initialLyrics: migratedFile.lyrics,
      };
    }

    const activeFileId = storedActiveId || fallbackId;
    try {
      storage.setItem(STORAGE_KEY_FILES, JSON.stringify([]));
      storage.setItem(STORAGE_KEY_ACTIVE_ID, activeFileId);
    } catch {
      // Ignore storage quota errors
    }
    return {
      savedFiles: [],
      activeFileId,
      initialMelody: EXAMPLE_SONG_01.melody,
      initialLyrics: EXAMPLE_SONG_01.lyrics,
    };
  }

  let savedFiles: SavedSongFile[] = [];
  try {
    const parsed = JSON.parse(rawFilesJson);
    if (Array.isArray(parsed)) {
      savedFiles = parsed
        .filter(
          (item): item is SavedSongFile =>
            Boolean(item) &&
            typeof item.id === 'string' &&
            typeof item.melody === 'string' &&
            typeof item.lyrics === 'string' &&
            typeof item.updatedAt === 'number'
        )
        .map((item) => ({
          ...item,
          title:
            typeof item.title === 'string'
              ? item.title
              : extractDisplayTitle(item.lyrics, item.melody),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
  } catch {
    savedFiles = [];
  }

  if (storedActiveId) {
    const activeMatch = savedFiles.find((f) => f.id === storedActiveId);
    if (activeMatch) {
      return {
        savedFiles,
        activeFileId: activeMatch.id,
        initialMelody: activeMatch.melody,
        initialLyrics: activeMatch.lyrics,
      };
    }
    // Active ID was an unmodified Example Song session
    return {
      savedFiles,
      activeFileId: storedActiveId,
      initialMelody: EXAMPLE_SONG_01.melody,
      initialLyrics: EXAMPLE_SONG_01.lyrics,
    };
  }

  if (savedFiles.length > 0) {
    const first = savedFiles[0];
    try {
      storage.setItem(STORAGE_KEY_ACTIVE_ID, first.id);
    } catch {
      // Ignore
    }
    return {
      savedFiles,
      activeFileId: first.id,
      initialMelody: first.melody,
      initialLyrics: first.lyrics,
    };
  }

  try {
    storage.setItem(STORAGE_KEY_ACTIVE_ID, fallbackId);
  } catch {
    // Ignore
  }
  return {
    savedFiles: [],
    activeFileId: fallbackId,
    initialMelody: EXAMPLE_SONG_01.melody,
    initialLyrics: EXAMPLE_SONG_01.lyrics,
  };
}

/**
 * Synchronizes the current (activeFileId, melody, lyrics) into the saved files list
 * and persists to localStorage.
 *
 * - If content matches the exact untouched EXAMPLE_SONG_01, ensures activeFileId is removed
 *   from savedFiles (preventing untouched duplicate examples or undo-back-to-example zombies).
 * - Otherwise updates activeFileId in-place (preserving file identity across <title> edits)
 *   or inserts a new SavedSongFile entry, capped at MAX_SAVED_FILES.
 */
export function syncAutoSaveFile(params: {
  savedFiles: SavedSongFile[];
  activeFileId: string;
  melody: string;
  lyrics: string;
  isExampleSession?: boolean;
  now?: number;
  storage?: StorageLike;
}): SavedSongFile[] {
  const {
    savedFiles,
    activeFileId,
    melody,
    lyrics,
    isExampleSession = true,
    now = Date.now(),
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  } = params;

  try {
    storage?.setItem(STORAGE_KEY_ACTIVE_ID, activeFileId);
    // Keep legacy keys mirrored for backwards compatibility
    storage?.setItem('nmn_melody', melody);
    storage?.setItem('nmn_lyrics', lyrics);
  } catch {
    // Ignore
  }

  // Rule 1: Unmodified Example Song guard & Undo-back-to-example zombie cleanup
  if (isExampleSession && isExactExampleSong(melody, lyrics)) {
    const exists = savedFiles.some((f) => f.id === activeFileId);
    if (!exists) {
      return savedFiles;
    }
    const cleaned = savedFiles.filter((f) => f.id !== activeFileId);
    try {
      storage?.setItem(STORAGE_KEY_FILES, JSON.stringify(cleaned));
    } catch {
      // Ignore
    }
    return cleaned;
  }

  const title = extractDisplayTitle(lyrics, melody);
  const existing = savedFiles.find((f) => f.id === activeFileId);

  // If already saved with identical content, do not artificially bump updatedAt
  if (
    existing &&
    existing.melody === melody &&
    existing.lyrics === lyrics &&
    existing.title === title
  ) {
    return savedFiles;
  }

  const updatedEntry: SavedSongFile = {
    id: activeFileId,
    title,
    melody,
    lyrics,
    updatedAt: now,
  };

  const others = savedFiles.filter((f) => f.id !== activeFileId);
  const nextFiles = [updatedEntry, ...others]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_FILES);

  try {
    storage?.setItem(STORAGE_KEY_FILES, JSON.stringify(nextFiles));
  } catch {
    // Ignore
  }

  return nextFiles;
}

/**
 * Deletes a non-active song file from savedFiles and persists to localStorage.
 */
export function removeSavedSongFile(
  savedFiles: SavedSongFile[],
  targetId: string,
  storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): SavedSongFile[] {
  const nextFiles = savedFiles.filter((f) => f.id !== targetId);
  try {
    storage?.setItem(STORAGE_KEY_FILES, JSON.stringify(nextFiles));
  } catch {
    // Ignore
  }
  return nextFiles;
}

/**
 * Formats a timestamp as a human-readable Traditional Chinese relative time string.
 */
export function formatRelativeTime(updatedAt: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - updatedAt);
  if (diffMs < 60_000) return '剛剛';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 7) return `${days} 天前`;

  const d = new Date(updatedAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
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
