import {
  IGNORED_LYRIC_CHARS,
  KeySignature,
  parseClassicSong,
  parseKey,
  parsePitch,
  parseTime,
} from './parserClassic';
import { MelodicUnit, NodeElement, Note, SongMetadata, SourceSpan } from './types';
import {
  formatSingleNoteToken,
  decomposeNoteAcrossBars,
  type ParsedTime,
} from './rhythmSplitter';

export { formatSingleNoteToken, decomposeNoteAcrossBars };

/**
 * Punctuation and slur characters commonly found attached to lyric syllables.
 */
const LYRIC_PUNCTUATION_CHARS = `${IGNORED_LYRIC_CHARS.trim()}~`;

/**
 * Surgically inserts a newline in lyricsText before the syllable at lyricSpan.
 * Any preceding spaces are absorbed into the line break.
 */
export function spliceLyricLineBreakBefore(
  lyricsText: string,
  lyricSpan: SourceSpan
): string {
  if (lyricSpan.start < 0 || lyricSpan.end > lyricsText.length) {
    return lyricsText;
  }

  // Look backwards from lyricSpan.start across spaces
  let insertIdx = lyricSpan.start;
  while (insertIdx > 0 && lyricsText[insertIdx - 1] === ' ') {
    insertIdx--;
  }

  // If there's already a newline right before, don't duplicate
  if (insertIdx > 0 && (lyricsText[insertIdx - 1] === '\n' || lyricsText[insertIdx - 1] === '\r')) {
    return lyricsText;
  }

  return lyricsText.slice(0, insertIdx) + '\n' + lyricsText.slice(lyricSpan.start);
}

/**
 * Surgically inserts a newline in lyricsText after the syllable at lyricSpan,
 * including any trailing punctuation attached to that syllable.
 */
export function spliceLyricLineBreak(
  lyricsText: string,
  lyricSpan: SourceSpan
): string {
  if (lyricSpan.start < 0 || lyricSpan.end > lyricsText.length) {
    return lyricsText;
  }

  // Find the insertion point: immediately after the syllable and any trailing punctuation
  let insertIdx = lyricSpan.end;
  while (insertIdx < lyricsText.length) {
    const ch = lyricsText[insertIdx];
    if (ch === '\r' || ch === '\n') {
      // Already at a newline, no need to add another
      return lyricsText;
    }
    if (LYRIC_PUNCTUATION_CHARS.includes(ch)) {
      insertIdx++;
    } else {
      break;
    }
  }

  // If there is a space right after punctuation, absorb it into the line break
  let removeLen = 0;
  if (insertIdx < lyricsText.length && lyricsText[insertIdx] === ' ') {
    removeLen = 1;
  }

  return lyricsText.slice(0, insertIdx) + '\n' + lyricsText.slice(insertIdx + removeLen);
}

/**
 * Surgically removes a newline immediately following the syllable at lyricSpan.
 */
export function spliceRemoveLyricLineBreak(
  lyricsText: string,
  lyricSpan: SourceSpan
): string {
  if (lyricSpan.start < 0 || lyricSpan.end > lyricsText.length) {
    return lyricsText;
  }

  let idx = lyricSpan.end;
  // Skip punctuation
  while (
    idx < lyricsText.length &&
    (LYRIC_PUNCTUATION_CHARS.includes(lyricsText[idx]) || lyricsText[idx] === ' ') &&
    lyricsText[idx] !== '\n' &&
    lyricsText[idx] !== '\r'
  ) {
    idx++;
  }

  if (idx < lyricsText.length) {
    if (lyricsText[idx] === '\r' && lyricsText[idx + 1] === '\n') {
      return lyricsText.slice(0, idx) + lyricsText.slice(idx + 2);
    } else if (lyricsText[idx] === '\n') {
      return lyricsText.slice(0, idx) + lyricsText.slice(idx + 1);
    }
  }

  return lyricsText;
}

/**
 * Surgically replaces a lyric character at lyricSpan with a new character.
 */
export function spliceLyricChar(
  lyricsText: string,
  lyricSpan: SourceSpan,
  newChar: string
): string {
  if (lyricSpan.start < 0 || lyricSpan.end > lyricsText.length) {
    return lyricsText;
  }
  return lyricsText.slice(0, lyricSpan.start) + newChar + lyricsText.slice(lyricSpan.end);
}

/**
 * Surgically expands a lyric unit group by appending a '~' token.
 * If existingSlurSpans is provided and non-empty, inserts '~' immediately after the last '~'.
 * Otherwise inserts '~' immediately after rootSpan.
 */
export function spliceExpandLyricGroup(
  lyricsText: string,
  rootSpan: SourceSpan,
  existingSlurSpans?: SourceSpan[]
): string {
  const insertPos =
    existingSlurSpans && existingSlurSpans.length > 0
      ? existingSlurSpans[existingSlurSpans.length - 1].end
      : rootSpan.end;

  if (insertPos < 0 || insertPos > lyricsText.length) {
    return lyricsText;
  }

  return lyricsText.slice(0, insertPos) + '~' + lyricsText.slice(insertPos);
}

/**
 * Surgically breaks a multi-unit lyric group into single-unit groups by removing all '~' tokens
 * belonging to the group (specified by slurSpans).
 */
export function spliceBreakLyricGroup(
  lyricsText: string,
  slurSpans: SourceSpan[]
): string {
  if (!slurSpans || slurSpans.length === 0) {
    return lyricsText;
  }

  const sorted = [...slurSpans].sort((a, b) => b.start - a.start);
  let result = lyricsText;

  for (const span of sorted) {
    if (span.start < 0 || span.end > result.length || span.start >= span.end) {
      continue;
    }
    const before = result.slice(0, span.start);
    const after = result.slice(span.end);
    const wsBeforeMatch = before.match(/[ \t\u3000]+$/);
    const wsAfterMatch = after.match(/^[ \t\u3000]+/);
    if (wsBeforeMatch && wsAfterMatch) {
      result =
        before.slice(0, before.length - wsBeforeMatch[0].length) +
        wsBeforeMatch[0][0] +
        after.slice(wsAfterMatch[0].length);
    } else {
      result = before + after;
    }
  }

  return result;
}

/**
 * Surgically toggles a rest between '0' and 'o' (REST_AT_END) in melodyText.
 * If toEnd is true: converts '0' to 'o'.
 * If toEnd is false: converts 'o' to '0'.
 */
export function spliceMelodyTrailingRest(
  melodyText: string,
  melodySpan: SourceSpan,
  toEnd: boolean
): string {
  if (melodySpan.start < 0 || melodySpan.end > melodyText.length) {
    return melodyText;
  }

  const existingChar = melodyText.slice(melodySpan.start, melodySpan.end);
  if (toEnd && existingChar === '0') {
    return melodyText.slice(0, melodySpan.start) + 'o' + melodyText.slice(melodySpan.end);
  } else if (!toEnd && existingChar === 'o') {
    return melodyText.slice(0, melodySpan.start) + '0' + melodyText.slice(melodySpan.end);
  }

  return melodyText;
}

/**
 * Normalizes user-entered pitch strings:
 * Converts unicode single quotes (’, ‘, ′, ＇, `, ´) to standard ASCII apostrophe `'`,
 * and fullwidth commas (，, 、) to standard ASCII `,`.
 */
export function normalizePitchString(pitch: string): string {
  if (!pitch) return pitch;
  return pitch
    .replace(/[’‘′＇`´]/g, "'")
    .replace(/[，、]/g, ',');
}

/**
 * Formats a Note object to its numbered musical notation pitch string.
 */
export function formatPitchFromNote(note: Note): string {
  return note.toPitchString();
}

/**
 * Validates whether a string is a recognized pitch token in numbered musical notation.
 * Returns true for standard pitches (0-7, accidentals #/$, octave dots ', etc.), false otherwise.
 */
export function isValidPitchString(pitch: string, key: KeySignature = [1, 0]): boolean {
  if (!pitch || !pitch.trim()) return false;
  const normalized = normalizePitchString(pitch.trim());
  try {
    parsePitch(key, normalized);
    return true;
  } catch {
    if (key !== 'solfa') {
      try {
        parsePitch('solfa', normalized);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Surgically replaces a melody note's pitch at melodySpan with a new pitch token.
 * If newPitch is invalid (e.g. 'p'), the edit is rejected and melodyText is unchanged.
 */
export function spliceMelodyPitch(
  melodyText: string,
  target: SourceSpan | MelodicUnit,
  newPitch: string
): string {
  if ('segments' in target && 'pitch' in target) {
    return modifyMelodicUnitDuration(
      melodyText,
      target as MelodicUnit,
      target.duration.toNumber(),
      newPitch
    );
  }

  const melodySpan = target as SourceSpan;
  if (melodySpan.start < 0 || melodySpan.end > melodyText.length) {
    return melodyText;
  }
  const normalized = normalizePitchString(newPitch.trim());
  if (!isValidPitchString(normalized)) {
    return melodyText;
  }
  const updated = spliceMelodyNoteDuration(melodyText, melodySpan, undefined, normalized);
  if (updated !== melodyText) {
    return updated;
  }
  return melodyText.slice(0, melodySpan.start) + normalized + melodyText.slice(melodySpan.end);
}


/**
 * Calculates duration in quarter note beats from a duration modifier string.
 */
export function parseDurationString(durationStr: string): number {
  const dots = (durationStr.match(/\./g) || []).length;
  const dashes = (durationStr.match(/-/g) || []).length;
  const underlines =
    (durationStr.match(/=/g) || []).length * 2 +
    (durationStr.match(/_/g) || []).length;

  let triplet = 1;
  if (durationStr.includes('/3')) {
    triplet = 2 / 3;
  }

  const base = (dashes + 1) / (1 << underlines);
  const dotMultiplier = 2 - 1 / (1 << dots);
  return base * dotMultiplier * triplet;
}

interface ParsedMelodyNoteItem {
  pitch: string;
  duration: number;
  pitchStart: number;
  pitchEnd: number;
  tokenStart: number;
  tokenEnd: number;
  leadingTie: boolean;
  trailingTie: boolean;
  barIndex: number;
}

function extractMelodyKeyAt(melodyText: string, offset?: number): KeySignature {
  const slice = offset !== undefined ? melodyText.slice(0, offset) : melodyText;
  const matches = [...slice.matchAll(/^[ \t]*<key>\s*([^\r\n]+)/gm)];
  const chosen =
    matches.length > 0
      ? matches[matches.length - 1]
      : melodyText.match(/^[ \t]*<key>\s*([^\r\n]+)/m);
  if (chosen) {
    try {
      return parseKey(chosen[1]);
    } catch {
      // Fall back to default C major
    }
  }
  return [1, 0];
}

function areSameTiedPitch(p1: string, p2: string, key: KeySignature): boolean {
  if (p1 === '0' || p1 === 'o' || p2 === '0' || p2 === 'o') return false;
  if (p1 === p2) return true;
  try {
    const [acc1, name1, oct1] = parsePitch(key, p1);
    const [acc2, name2, oct2] = parsePitch(key, p2);
    if (name1 <= 0 || name2 <= 0) return false;
    return name1 === name2 && (acc1 ?? 0) === (acc2 ?? 0) && oct1 === oct2;
  } catch {
    return false;
  }
}

function applyPitchAndTieEdits(
  melodyText: string,
  edits: { start: number; end: number; text: string; isTieRemoval?: boolean }[]
): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = melodyText;
  for (const edit of sorted) {
    if (edit.isTieRemoval) {
      const before = result.slice(0, edit.start);
      const after = result.slice(edit.end);
      const wsBefore = before.match(/[ \t]+$/);
      const wsAfter = after.match(/^[ \t]+/);
      if (wsBefore && wsAfter) {
        result =
          before.slice(0, before.length - wsBefore[0].length) +
          wsBefore[0][0] +
          after.slice(wsAfter[0].length);
      } else if (
        !wsBefore &&
        !wsAfter &&
        before.length > 0 &&
        after.length > 0 &&
        !/[\r\n]$/.test(before) &&
        !/^[\r\n]/.test(after)
      ) {
        result = before + ' ' + after;
      } else {
        result = before + after;
      }
    } else {
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    }
  }
  return result;
}

function getBar0PickupOffset(melodyText: string, measureDuration: number): number {
  const firstPipeIdx = melodyText.indexOf('|');
  const bar0Text = firstPipeIdx >= 0 ? melodyText.slice(0, firstPipeIdx) : melodyText;
  const cleaned = bar0Text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith('//') && !t.startsWith('<');
    })
    .join(' ');

  const patternPitch = "[#$%]?[0-9a-zA-Z][',]*";
  const patternPitches = `\\[(?:${patternPitch})+\\]`;
  const patternDuration = '(?:[_=]+|-*)\\.*(?:/3)?';
  const tokenRegex = new RegExp(
    `(${patternPitches}|${patternPitch})(${patternDuration})`,
    'g'
  );

  let bar0Dur = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(cleaned)) !== null) {
    const isBracketed = m[1].startsWith('[');
    const durStr = m[2];
    const dur = parseDurationString(durStr);
    if (isBracketed) {
      const pitches = m[1].match(new RegExp(patternPitch, 'g')) || [];
      bar0Dur += pitches.length * dur;
    } else {
      bar0Dur += dur;
    }
  }

  if (firstPipeIdx >= 0 && bar0Dur > 0 && bar0Dur < measureDuration) {
    return measureDuration - bar0Dur;
  }
  return 0;
}

function isNoteInBar0Pickup(melodyText: string, unit: MelodicUnit): boolean {
  if (unit.segments[0]?.barIndex !== 0) return false;
  const firstPipeIdx = melodyText.indexOf('|');
  if (firstPipeIdx < 0) return false;
  const segStart = unit.segments[0]?.span?.start ?? 0;
  return segStart < firstPipeIdx;
}

/**
 * Modifies the duration (and optionally pitch) of a MelodicUnit directly from the AST.
 * Implements the user's Canonical Bracket Splitting Rule:
 * - If the unit is inside a bracket [...], partition remaining notes into left and right groups:
 *   - If |group| == 1, drops the bracket for that group.
 *   - If |group| >= 2, keeps the bracket for that group.
 * - If the unit is unbracketed, replaces its token in-place or decomposes across barlines with ties.
 * - If the unit spans multiple tied segments across barlines, updates the entire tied unit in-place.
 */
export function modifyMelodicUnitDuration(
  melodyText: string,
  unit: MelodicUnit,
  newDuration: number,
  newPitch?: string
): string {
  if (isNaN(newDuration) || newDuration <= 0) {
    return melodyText;
  }
  if (newPitch && !isValidPitchString(newPitch)) {
    return melodyText;
  }

  // Determine measure duration and time signature from <time>
  let measureDuration = 4;
  let parsedTime: ParsedTime = { upper: 4, lower: 4 };
  const timeMatch = melodyText.match(/<time>\s*([^\r\n]+)/);
  if (timeMatch) {
    try {
      parsedTime = parseTime(timeMatch[1]);
      if (parsedTime.upper > 0 && parsedTime.lower > 0) {
        measureDuration = (parsedTime.upper / parsedTime.lower) * 4;
      }
    } catch {
      // keep default 4/4
    }
  }

  // Determine target pitch string
  let targetPitch = newPitch ? normalizePitchString(newPitch.trim()) : '';
  if (!targetPitch) {
    if (unit.segments[0]?.pitchSpan) {
      targetPitch = melodyText
        .slice(unit.segments[0].pitchSpan.start, unit.segments[0].pitchSpan.end)
        .trim();
    }
    if (!targetPitch) {
      if (unit.pitch.isRest) {
        targetPitch = unit.pitch.restType || '0';
      } else {
        let p = '';
        if (unit.pitch.accidental === 1) p += '#';
        else if (unit.pitch.accidental === -1) p += 'b';
        p += unit.pitch.name.toString();
        if (unit.pitch.octave > 0) p += "'".repeat(unit.pitch.octave);
        else if (unit.pitch.octave < 0) p += ','.repeat(-unit.pitch.octave);
        targetPitch = p;
      }
    }
  }

  const curDuration = unit.duration.toNumber();
  const isDurationUnchanged = Math.abs(curDuration - newDuration) < 1e-6;
  const isRestTarget = targetPitch === '0' || targetPitch === 'o';

  // Pitch-only edit fast path: preserve all existing segment durations, ties (~),
  // brackets ([...]), whitespace, and barlines (|) in-place.
  if (
    isDurationUnchanged &&
    unit.segments.length > 0 &&
    unit.segments.every(
      (seg) =>
        seg.pitchSpan &&
        seg.pitchSpan.start >= 0 &&
        seg.pitchSpan.end <= melodyText.length &&
        seg.pitchSpan.start < seg.pitchSpan.end
    )
  ) {
    if (!newPitch) {
      return melodyText;
    }

    const seenSpans = new Set<string>();
    const uniquePitchSpans: SourceSpan[] = [];
    for (const seg of unit.segments) {
      const ps = seg.pitchSpan!;
      const key = `${ps.start}:${ps.end}`;
      if (!seenSpans.has(key)) {
        seenSpans.add(key);
        uniquePitchSpans.push(ps);
      }
    }

    if (!isRestTarget) {
      if (
        uniquePitchSpans.every(
          (ps) => melodyText.slice(ps.start, ps.end) === targetPitch
        )
      ) {
        return melodyText;
      }
      const sorted = [...uniquePitchSpans].sort((a, b) => b.start - a.start);
      let result = melodyText;
      for (const ps of sorted) {
        result = result.slice(0, ps.start) + targetPitch + result.slice(ps.end);
      }
      return result;
    }

    // Rest target ('0' or 'o'): replace each segment's pitch and strip '~' ties
    // attached to the edited segment(s) (since rests cannot be tied in NMN).
    const edits: { start: number; end: number; text: string; isTieRemoval?: boolean }[] =
      uniquePitchSpans.map((ps) => ({
        start: ps.start,
        end: ps.end,
        text: targetPitch,
      }));

    const seenTies = new Set<number>();
    for (let i = 0; i < unit.segments.length; i++) {
      const seg = unit.segments[i];
      const segSpan = seg.bracket ? seg.bracket.tokenSpan : seg.span;
      const canOwnTrailingTie =
        !seg.bracket || seg.bracket.indexInGroup === seg.bracket.totalInGroup - 1;
      const canOwnLeadingTie = !seg.bracket || seg.bracket.indexInGroup === 0;
      if (
        canOwnTrailingTie &&
        segSpan.end > 0 &&
        melodyText[segSpan.end - 1] === '~' &&
        !seenTies.has(segSpan.end - 1)
      ) {
        seenTies.add(segSpan.end - 1);
        edits.push({
          start: segSpan.end - 1,
          end: segSpan.end,
          text: '',
          isTieRemoval: true,
        });
      }
      if (
        canOwnLeadingTie &&
        segSpan.start >= 0 &&
        melodyText[segSpan.start] === '~' &&
        !seenTies.has(segSpan.start)
      ) {
        seenTies.add(segSpan.start);
        edits.push({
          start: segSpan.start,
          end: segSpan.start + 1,
          text: '',
          isTieRemoval: true,
        });
      }
    }

    return applyPitchAndTieEdits(melodyText, edits);
  }

  const startBeatInBar = unit.segments[0].beatInBar.toNumber();
  const pickupOffset = isNoteInBar0Pickup(melodyText, unit)
    ? getBar0PickupOffset(melodyText, measureDuration)
    : 0;
  const effectiveStartBeat = Math.max(0, startBeatInBar - pickupOffset);
  const spaceLeftInBar = measureDuration - effectiveStartBeat;
  const crossesBar = newDuration > spaceLeftInBar + 1e-6;

  // Handle single-segment bracketed unit
  if (unit.segments.length === 1 && unit.segments[0]?.bracket) {
    const bracket = unit.segments[0].bracket;
    const bracketText = melodyText
      .slice(bracket.tokenSpan.start, bracket.tokenSpan.end)
      .replace(/\s+/g, '');
    const bracketMatch = bracketText.match(/^(~?)\[(.*?)\]([_=\-./3]*)(~?)$/);
    if (bracketMatch) {
      let leadingTie = bracketMatch[1];
      const pitchesRaw = bracketMatch[2];
      const durationSuffix = bracketMatch[3] || bracket.durationSuffix;
      let trailingTie = bracketMatch[4];

      const pitches = pitchesRaw.match(/[#$%]?[0-9a-zA-Z][',]*/g) || [];
      const targetIdx = bracket.indexInGroup;

      if (isRestTarget) {
        if (targetIdx === 0) leadingTie = '';
        if (targetIdx === pitches.length - 1) trailingTie = '';
      }

      if (Math.abs(curDuration - newDuration) < 1e-6) {
        // Pitch only changed inside bracket
        pitches[targetIdx] = targetPitch;
        const newBracket = `${leadingTie}[${pitches.join('')}]${durationSuffix}${trailingTie}`;
        return (
          melodyText.slice(0, bracket.tokenSpan.start) +
          newBracket +
          melodyText.slice(bracket.tokenSpan.end)
        );
      }

      // Duration changed: Canonical Bracket Splitting
      const leftPitches = pitches.slice(0, targetIdx);
      const rightPitches = pitches.slice(targetIdx + 1);

      let leftPart = '';
      if (leftPitches.length === 1) {
        leftPart = leftPitches[0] + durationSuffix;
      } else if (leftPitches.length >= 2) {
        leftPart = '[' + leftPitches.join('') + ']' + durationSuffix;
      }

      let rightPart = '';
      if (rightPitches.length === 1) {
        rightPart = rightPitches[0] + durationSuffix;
      } else if (rightPitches.length >= 2) {
        rightPart = '[' + rightPitches.join('') + ']' + durationSuffix;
      }

      if (!crossesBar) {
        let targetPart = formatSingleNoteToken(targetPitch, newDuration);
        if (leadingTie) {
          if (leftPart) leftPart = leadingTie + leftPart;
          else targetPart = leadingTie + targetPart;
        }
        if (trailingTie) {
          if (rightPart) rightPart = rightPart + trailingTie;
          else targetPart = targetPart + trailingTie;
        }
        const parts = [leftPart, targetPart, rightPart].filter(Boolean);
        const replacement = parts.join(' ');
        return (
          melodyText.slice(0, bracket.tokenSpan.start) +
          replacement +
          melodyText.slice(bracket.tokenSpan.end)
        );
      } else {
        const { bars: noteBars } = decomposeNoteAcrossBars(
          targetPitch,
          newDuration,
          effectiveStartBeat,
          parsedTime
        );
        const bar0Tokens = [leftPart, ...noteBars[0]].filter(Boolean);
        if (leadingTie && bar0Tokens.length > 0) {
          bar0Tokens[0] = leadingTie + bar0Tokens[0];
        }

        const lastBarIdx = noteBars.length - 1;
        const lastBarTokens = [...noteBars[lastBarIdx], rightPart].filter(Boolean);
        if (trailingTie && lastBarTokens.length > 0) {
          lastBarTokens[lastBarTokens.length - 1] =
            lastBarTokens[lastBarTokens.length - 1] + trailingTie;
        }

        const assembledBars: string[] = [bar0Tokens.join(' ')];
        for (let b = 1; b < lastBarIdx; b++) {
          assembledBars.push(noteBars[b].join(' '));
        }
        assembledBars.push(lastBarTokens.join(' '));

        const textAfter = melodyText.slice(bracket.tokenSpan.end);
        const existingBarlineMatch = textAfter.match(/^([ \t]*\|[ \t]*)/);
        if (existingBarlineMatch) {
          const afterBarline = textAfter.slice(existingBarlineMatch[0].length);
          const replacement =
            assembledBars[0] + existingBarlineMatch[1] + assembledBars.slice(1).join(' ');
          return (
            melodyText.slice(0, bracket.tokenSpan.start) +
            replacement +
            (afterBarline.startsWith(' ') || afterBarline.startsWith('\n') ? '' : ' ') +
            afterBarline
          );
        } else {
          const replacement = assembledBars.join(' ');
          return (
            melodyText.slice(0, bracket.tokenSpan.start) +
            replacement +
            melodyText.slice(bracket.tokenSpan.end)
          );
        }
      }
    }
  }

  // Handle single unbracketed note or multi-segment tied note (including mixed bracket+tie)
  const firstSeg = unit.segments[0];
  const lastSeg = unit.segments[unit.segments.length - 1];
  const replaceStart = firstSeg.bracket ? firstSeg.bracket.tokenSpan.start : firstSeg.span.start;
  const replaceEnd = lastSeg.bracket ? lastSeg.bracket.tokenSpan.end : lastSeg.span.end;

  let leftPrefix = '';
  let firstBracketLeadingTie = false;
  if (firstSeg.bracket) {
    const bText = melodyText
      .slice(firstSeg.bracket.tokenSpan.start, firstSeg.bracket.tokenSpan.end)
      .replace(/\s+/g, '');
    const bMatch = bText.match(/^(~?)\[(.*?)\]([_=\-./3]*)(~?)$/);
    if (bMatch) {
      firstBracketLeadingTie = bMatch[1] !== '';
      const bPitches = bMatch[2].match(/[#$%]?[0-9a-zA-Z][',]*/g) || [];
      const bSuffix = bMatch[3] || firstSeg.bracket.durationSuffix;
      const leftPitches = bPitches.slice(0, firstSeg.bracket.indexInGroup);
      if (leftPitches.length === 1) {
        leftPrefix = leftPitches[0] + bSuffix;
      } else if (leftPitches.length >= 2) {
        leftPrefix = '[' + leftPitches.join('') + ']' + bSuffix;
      }
    }
  }

  let rightSuffix = '';
  let lastBracketTrailingTie = false;
  if (lastSeg.bracket) {
    const bText = melodyText
      .slice(lastSeg.bracket.tokenSpan.start, lastSeg.bracket.tokenSpan.end)
      .replace(/\s+/g, '');
    const bMatch = bText.match(/^(~?)\[(.*?)\]([_=\-./3]*)(~?)$/);
    if (bMatch) {
      lastBracketTrailingTie = bMatch[4] !== '';
      const bPitches = bMatch[2].match(/[#$%]?[0-9a-zA-Z][',]*/g) || [];
      const bSuffix = bMatch[3] || lastSeg.bracket.durationSuffix;
      const rightPitches = bPitches.slice(lastSeg.bracket.indexInGroup + 1);
      if (rightPitches.length === 1) {
        rightSuffix = rightPitches[0] + bSuffix;
      } else if (rightPitches.length >= 2) {
        rightSuffix = '[' + rightPitches.join('') + ']' + bSuffix;
      }
    }
  }

  const alreadyHasLeadingTie = melodyText.slice(0, replaceStart).trimEnd().endsWith('~');
  const leadingTie =
    !alreadyHasLeadingTie &&
    !(isRestTarget && !leftPrefix) &&
    (firstSeg.bracket
      ? firstBracketLeadingTie
      : firstSeg.tiedPrev || firstSeg.rawToken?.startsWith('~'));

  const alreadyHasTrailingTie = melodyText.slice(replaceEnd).trimStart().startsWith('~');
  const trailingTie =
    !alreadyHasTrailingTie &&
    !(isRestTarget && !rightSuffix) &&
    (lastSeg.bracket
      ? lastBracketTrailingTie
      : lastSeg.tiedNext || lastSeg.rawToken?.endsWith('~'));

  if (!crossesBar) {
    let targetPart = formatSingleNoteToken(targetPitch, newDuration);
    if (leadingTie) {
      if (leftPrefix) leftPrefix = '~' + leftPrefix;
      else targetPart = '~' + targetPart;
    }
    if (trailingTie) {
      if (rightSuffix) rightSuffix = rightSuffix + '~';
      else targetPart = targetPart + '~';
    }

    if (unit.segments.length > 1) {
      const textBetween = melodyText.slice(replaceStart, replaceEnd);
      if (textBetween.includes('|')) {
        targetPart = targetPart + ' |';
      }
    }

    const replacement = [leftPrefix, targetPart, rightSuffix].filter(Boolean).join(' ');
    return (
      melodyText.slice(0, replaceStart) +
      replacement +
      melodyText.slice(replaceEnd)
    );
  } else {
    const { bars: noteBars } = decomposeNoteAcrossBars(
      targetPitch,
      newDuration,
      effectiveStartBeat,
      parsedTime
    );
    const lastBarIdx = noteBars.length - 1;
    let assembledBars: string[][];
    if (lastBarIdx === 0) {
      const singleBarTokens = [leftPrefix, ...noteBars[0], rightSuffix].filter(Boolean);
      if (leadingTie && singleBarTokens.length > 0) {
        singleBarTokens[0] = '~' + singleBarTokens[0];
      }
      if (trailingTie && singleBarTokens.length > 0) {
        singleBarTokens[singleBarTokens.length - 1] =
          singleBarTokens[singleBarTokens.length - 1] + '~';
      }
      assembledBars = [singleBarTokens];
    } else {
      const bar0Tokens = [leftPrefix, ...noteBars[0]].filter(Boolean);
      if (leadingTie && bar0Tokens.length > 0) {
        bar0Tokens[0] = '~' + bar0Tokens[0];
      }
      const lastBarTokens = [...noteBars[lastBarIdx], rightSuffix].filter(Boolean);
      if (trailingTie && lastBarTokens.length > 0) {
        lastBarTokens[lastBarTokens.length - 1] =
          lastBarTokens[lastBarTokens.length - 1] + '~';
      }
      assembledBars = [
        bar0Tokens,
        ...noteBars.slice(1, lastBarIdx),
        lastBarTokens,
      ];
    }

    const textAfter = melodyText.slice(replaceEnd);
    const textBetween = melodyText.slice(replaceStart, replaceEnd);
    const hadBarlineInside = textBetween.includes('|');

    if (!hadBarlineInside) {
      const existingBarlineMatch = textAfter.match(/^([ \t]*\|[ \t]*)/);
      if (existingBarlineMatch) {
        const afterBarline = textAfter.slice(existingBarlineMatch[0].length);
        const bar0Str = assembledBars[0].join(' ');
        const restBarsStr = assembledBars.slice(1).map((b) => b.join(' ')).join(' ');
        const replacement = bar0Str + existingBarlineMatch[1] + restBarsStr;
        return (
          melodyText.slice(0, replaceStart) +
          replacement +
          (afterBarline.startsWith(' ') || afterBarline.startsWith('\n') ? '' : ' ') +
          afterBarline
        );
      }
    }

    const barSep = hadBarlineInside ? ' | ' : ' ';
    const replacement = assembledBars.map((b) => b.join(' ')).join(barSep);
    return (
      melodyText.slice(0, replaceStart) +
      replacement +
      melodyText.slice(replaceEnd)
    );
  }
}

/**
 * Strategy A: Minimal In-Place Duration Edit.
 * Surgically replaces only the target note's token (including attached dashes/modifiers
 * or tied continuation notes within the same bar, or within its bracket) in melodyText.
 * Existing '|' barlines, other notes, line breaks, comments, and downstream text remain
 * 100% byte-for-byte identical.
 */
export function spliceMelodyNoteDuration(
  melodyText: string,
  target: SourceSpan | MelodicUnit,
  newDuration?: number,
  newPitch?: string
): string {
  if ('segments' in target && 'pitch' in target) {
    const dur = newDuration !== undefined ? newDuration : target.duration.toNumber();
    return modifyMelodicUnitDuration(melodyText, target as MelodicUnit, dur, newPitch);
  }

  const targetSpan = target as SourceSpan;
  if (targetSpan.start < 0 || targetSpan.end > melodyText.length) {
    return melodyText;
  }
  if (newPitch && !isValidPitchString(newPitch)) {
    return melodyText;
  }

  try {
    const ast = parseClassicSong(melodyText, '');
    let matchedUnit: MelodicUnit | undefined;
    for (const sec of ast.sections) {
      for (const line of sec.lines) {
        for (const u of line.units) {
          const isMatch =
            u.melodySpan.start === targetSpan.start ||
            (u.melodySpan.start <= targetSpan.start && targetSpan.start < u.melodySpan.end) ||
            u.segments.some(
              (seg) =>
                (seg.pitchSpan &&
                  seg.pitchSpan.start <= targetSpan.start &&
                  targetSpan.start < seg.pitchSpan.end) ||
                (!seg.bracket &&
                  seg.span.start <= targetSpan.start &&
                  targetSpan.start < seg.span.end)
            );
          if (isMatch) {
            matchedUnit = u;
            break;
          }
        }
        if (matchedUnit) break;
      }
      if (matchedUnit) break;
    }
    if (matchedUnit) {
      const dur = newDuration !== undefined ? newDuration : matchedUnit.duration.toNumber();
      return modifyMelodicUnitDuration(melodyText, matchedUnit, dur, newPitch);
    }
  } catch {
    // fallback to regex below
  }

  // Determine measure duration and time signature from <time>
  let measureDuration = 4;
  let parsedTime: ParsedTime = { upper: 4, lower: 4 };
  const timeMatch = melodyText.match(/<time>\s*([^\r\n]+)/);
  if (timeMatch) {
    try {
      parsedTime = parseTime(timeMatch[1]);
      if (parsedTime.upper > 0 && parsedTime.lower > 0) {
        measureDuration = (parsedTime.upper / parsedTime.lower) * 4;
      }
    } catch {
      // keep default 4/4
    }
  }

  // Parse non-whitespace musical characters and map offsets to melodyText
  const patternPitch = "[#$%]?[0-9a-zA-Z][',]*";
  const patternPitches = `\\[(?:${patternPitch})+\\]`;
  const patternDuration = '(?:[_=]+|-*)\\.*(?:/3)?';
  const regex = new RegExp(
    `(~?)(${patternPitch}|${patternPitches})(${patternDuration})(~?)`,
    'g'
  );

  let s = '';
  const sOffsetMap: number[] = [];
  let lineOffset = 0;
  const rawLines = melodyText.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    const nlMatch = melodyText.slice(lineOffset + rawLine.length).match(/^(\r?\n)/);
    const nlLen = nlMatch ? nlMatch[0].length : 1;

    if (
      !trimmed ||
      trimmed === 'break' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('<')
    ) {
      lineOffset += rawLine.length + nlLen;
      continue;
    }

    for (let c = 0; c < rawLine.length; c++) {
      const ch = rawLine[c];
      if (!/\s/.test(ch)) {
        s += ch;
        sOffsetMap.push(lineOffset + c);
      }
    }
    lineOffset += rawLine.length + nlLen;
  }

  interface ParsedItem {
    pitch: string;
    duration: number;
    pitchStart: number;
    pitchEnd: number;
    tokenStart: number;
    tokenEnd: number;
    leadingTie: boolean;
    trailingTie: boolean;
    barIndex: number;
    isBracketed: boolean;
    durationStr: string;
    startBeatInBar: number;
  }

  const parsedNotes: ParsedItem[] = [];
  const bars = s.split('|');
  let currentPosInS = 0;

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b];
    const barStartInS = currentPosInS;
    currentPosInS += bar.length + 1; // +1 for '|'

    if (!bar) continue;

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    const notesInThisBar: ParsedItem[] = [];

    while ((match = regex.exec(bar)) !== null) {
      const matchStartInBar = match.index;
      const matchLen = match[0].length;
      const leadingTie = match[1] !== '';
      const pitchesRaw = match[2];
      const durationStr = match[3];
      const trailingTie = match[4] !== '';

      const isBracketed = pitchesRaw.startsWith('[') && pitchesRaw.endsWith(']');
      const dur =
        parsedTime.hyphen && !isBracketed
          ? ((durationStr.match(/-/g) || []).length + 1) / Math.floor(parsedTime.hyphen / 4)
          : parseDurationString(durationStr);
      const innerPitches = pitchesRaw.replace(/^\[|\]$/g, '');
      const pitchMatches = innerPitches.match(new RegExp(patternPitch, 'g')) || [];

      const tokenStartInS = barStartInS + matchStartInBar;
      const tokenEndInS = tokenStartInS + matchLen - 1;
      const tokenStartInMelody = sOffsetMap[tokenStartInS];
      const tokenEndInMelody = sOffsetMap[tokenEndInS] + 1;

      let currentPitchOffsetInRaw = isBracketed ? 1 : 0;
      for (let k = 0; k < pitchMatches.length; k++) {
        const p = pitchMatches[k];
        const pitchPosInRaw = pitchesRaw.indexOf(p, currentPitchOffsetInRaw);
        const pitchStartInBar =
          matchStartInBar + match[1].length + (pitchPosInRaw >= 0 ? pitchPosInRaw : 0);
        const pitchStartInS = barStartInS + pitchStartInBar;
        const pitchEndInS = pitchStartInS + p.length - 1;

        if (pitchPosInRaw >= 0) {
          currentPitchOffsetInRaw = pitchPosInRaw + p.length;
        }

        notesInThisBar.push({
          pitch: p,
          duration: dur,
          pitchStart: sOffsetMap[pitchStartInS],
          pitchEnd: sOffsetMap[pitchEndInS] + 1,
          tokenStart: tokenStartInMelody,
          tokenEnd: tokenEndInMelody,
          leadingTie: k === 0 ? leadingTie : false,
          trailingTie: k === pitchMatches.length - 1 ? trailingTie : false,
          barIndex: b,
          isBracketed,
          durationStr,
          startBeatInBar: 0,
        });
      }
    }

    if (notesInThisBar.length === 0) continue;

    let beat = 0;
    if (b === 0 && bars.length > 1) {
      const bar0TotalDur = notesInThisBar.reduce((sum, n) => sum + n.duration, 0);
      const mod = bar0TotalDur % measureDuration;
      beat = (measureDuration - mod) % measureDuration;
    }

    for (const note of notesInThisBar) {
      note.startBeatInBar = beat;
      beat = (beat + note.duration) % measureDuration;
      if (Math.abs(beat) < 1e-6 || Math.abs(beat - measureDuration) < 1e-6) {
        beat = 0;
      }
    }

    parsedNotes.push(...notesInThisBar);
  }

  if (parsedNotes.length === 0) {
    return melodyText;
  }

  // Find target note
  const targetIdx = parsedNotes.findIndex(
    (n) =>
      n.pitchStart === targetSpan.start ||
      (n.pitchStart <= targetSpan.start && targetSpan.start < n.pitchEnd)
  );

  if (targetIdx === -1) {
    return melodyText;
  }

  const targetNote = parsedNotes[targetIdx];
  const rawFinalPitch = newPitch || targetNote.pitch;
  const finalPitch = normalizePitchString(rawFinalPitch.trim());
  const activeKey = extractMelodyKeyAt(melodyText, targetNote.pitchStart);

  // Walk backward and forward across tied segments belonging to the same unit
  let startTargetIdx = targetIdx;
  while (startTargetIdx > 0) {
    const prev = parsedNotes[startTargetIdx - 1];
    const cur = parsedNotes[startTargetIdx];
    if (
      (prev.trailingTie || cur.leadingTie) &&
      areSameTiedPitch(prev.pitch, cur.pitch, activeKey)
    ) {
      startTargetIdx--;
    } else {
      break;
    }
  }

  let endTargetIdx = targetIdx;
  while (endTargetIdx + 1 < parsedNotes.length) {
    const cur = parsedNotes[endTargetIdx];
    const next = parsedNotes[endTargetIdx + 1];
    if (
      (cur.trailingTie || next.leadingTie) &&
      areSameTiedPitch(cur.pitch, next.pitch, activeKey)
    ) {
      endTargetIdx++;
    } else {
      break;
    }
  }

  let oldDuration = 0;
  for (let i = startTargetIdx; i <= endTargetIdx; i++) {
    oldDuration += parsedNotes[i].duration;
  }
  const targetDur = newDuration !== undefined ? newDuration : oldDuration;

  // Pitch-only edit in regex fallback: update each tied segment's pitch in-place
  if (Math.abs(oldDuration - targetDur) < 1e-6) {
    if (!newPitch) return melodyText;
    if (finalPitch !== '0' && finalPitch !== 'o') {
      const allSame = parsedNotes
        .slice(startTargetIdx, endTargetIdx + 1)
        .every((n) => n.pitch === finalPitch);
      if (allSame) return melodyText;
      let result = melodyText;
      for (let i = endTargetIdx; i >= startTargetIdx; i--) {
        const n = parsedNotes[i];
        result = result.slice(0, n.pitchStart) + finalPitch + result.slice(n.pitchEnd);
      }
      return result;
    }

    // Rest target ('0' or 'o'): replace pitches and strip owned '~' ties
    const edits: { start: number; end: number; text: string; isTieRemoval?: boolean }[] = [];
    const seenTies = new Set<number>();
    for (let i = startTargetIdx; i <= endTargetIdx; i++) {
      const n = parsedNotes[i];
      edits.push({ start: n.pitchStart, end: n.pitchEnd, text: finalPitch });
      if (n.trailingTie && n.tokenEnd > 0 && melodyText[n.tokenEnd - 1] === '~' && !seenTies.has(n.tokenEnd - 1)) {
        seenTies.add(n.tokenEnd - 1);
        edits.push({ start: n.tokenEnd - 1, end: n.tokenEnd, text: '', isTieRemoval: true });
      }
      if (n.leadingTie && n.tokenStart >= 0 && melodyText[n.tokenStart] === '~' && !seenTies.has(n.tokenStart)) {
        seenTies.add(n.tokenStart);
        edits.push({ start: n.tokenStart, end: n.tokenStart + 1, text: '', isTieRemoval: true });
      }
    }
    return applyPitchAndTieEdits(melodyText, edits);
  }

  // Handle single or multi-segment units (including bracketed start/end tokens)
  const firstNote = parsedNotes[startTargetIdx];
  const lastNote = parsedNotes[endTargetIdx];

  let firstGroupStartIdx = startTargetIdx;
  while (
    firstGroupStartIdx > 0 &&
    parsedNotes[firstGroupStartIdx - 1].tokenStart === firstNote.tokenStart
  ) {
    firstGroupStartIdx--;
  }

  let lastGroupEndIdx = endTargetIdx;
  while (
    lastGroupEndIdx + 1 < parsedNotes.length &&
    parsedNotes[lastGroupEndIdx + 1].tokenStart === lastNote.tokenStart
  ) {
    lastGroupEndIdx++;
  }

  const beforeNotes = parsedNotes.slice(firstGroupStartIdx, startTargetIdx);
  const afterNotes = parsedNotes.slice(endTargetIdx + 1, lastGroupEndIdx + 1);
  const isRestFinal = finalPitch === '0' || finalPitch === 'o';
  const replaceStart = firstNote.tokenStart;
  const replaceEnd = lastNote.tokenEnd;

  const alreadyHasLeadingTie = melodyText.slice(0, replaceStart).trimEnd().endsWith('~');
  const keepLeadingTie =
    !alreadyHasLeadingTie &&
    parsedNotes[firstGroupStartIdx].leadingTie &&
    !(isRestFinal && beforeNotes.length === 0);

  const alreadyHasTrailingTie = melodyText.slice(replaceEnd).trimStart().startsWith('~');
  const keepTrailingTie =
    !alreadyHasTrailingTie &&
    parsedNotes[lastGroupEndIdx].trailingTie &&
    !(isRestFinal && afterNotes.length === 0);

  let leftPrefix = '';
  if (beforeNotes.length === 1) {
    leftPrefix = formatSingleNoteToken(beforeNotes[0].pitch, beforeNotes[0].duration);
  } else if (beforeNotes.length > 1) {
    leftPrefix = '[' + beforeNotes.map((n) => n.pitch).join('') + ']' + firstNote.durationStr;
  }

  let rightSuffix = '';
  if (afterNotes.length === 1) {
    rightSuffix = formatSingleNoteToken(afterNotes[0].pitch, afterNotes[0].duration);
  } else if (afterNotes.length > 1) {
    rightSuffix = '[' + afterNotes.map((n) => n.pitch).join('') + ']' + lastNote.durationStr;
  }

  const spaceLeftInBar = measureDuration - firstNote.startBeatInBar;
  const crossesBar = targetDur > spaceLeftInBar + 1e-6;
  const textBetween = melodyText.slice(replaceStart, replaceEnd);
  const hadBarlineInside = textBetween.includes('|');

  if (!crossesBar) {
    let targetPart = formatSingleNoteToken(finalPitch, targetDur);
    if (keepLeadingTie) {
      if (leftPrefix) leftPrefix = '~' + leftPrefix;
      else targetPart = '~' + targetPart;
    }
    if (keepTrailingTie) {
      if (rightSuffix) rightSuffix = rightSuffix + '~';
      else targetPart = targetPart + '~';
    }
    if (hadBarlineInside) {
      targetPart = targetPart + ' |';
    }

    const replacement = [leftPrefix, targetPart, rightSuffix].filter(Boolean).join(' ');
    return melodyText.slice(0, replaceStart) + replacement + melodyText.slice(replaceEnd);
  } else {
    // Crosses barline
    const { bars: noteBars } = decomposeNoteAcrossBars(
      finalPitch,
      targetDur,
      firstNote.startBeatInBar,
      parsedTime
    );

    const lastBarIdx = noteBars.length - 1;
    let assembledBars: string[][];
    if (lastBarIdx === 0) {
      const singleBarTokens = [leftPrefix, ...noteBars[0], rightSuffix].filter(Boolean);
      if (keepLeadingTie && singleBarTokens.length > 0) {
        singleBarTokens[0] = '~' + singleBarTokens[0];
      }
      if (keepTrailingTie && singleBarTokens.length > 0) {
        singleBarTokens[singleBarTokens.length - 1] =
          singleBarTokens[singleBarTokens.length - 1] + '~';
      }
      assembledBars = [singleBarTokens];
    } else {
      const bar0Tokens = [leftPrefix, ...noteBars[0]].filter(Boolean);
      if (keepLeadingTie && bar0Tokens.length > 0) {
        bar0Tokens[0] = '~' + bar0Tokens[0];
      }
      const lastBarTokens = [...noteBars[lastBarIdx], rightSuffix].filter(Boolean);
      if (keepTrailingTie && lastBarTokens.length > 0) {
        lastBarTokens[lastBarTokens.length - 1] =
          lastBarTokens[lastBarTokens.length - 1] + '~';
      }
      assembledBars = [
        bar0Tokens,
        ...noteBars.slice(1, lastBarIdx),
        lastBarTokens,
      ];
    }

    const textAfter = melodyText.slice(replaceEnd);
    if (!hadBarlineInside) {
      const existingBarlineMatch = textAfter.match(/^([ \t]*\|[ \t]*)/);
      if (existingBarlineMatch) {
        const afterBarline = textAfter.slice(existingBarlineMatch[0].length);
        const bar0Str = assembledBars[0].join(' ');
        const restBarsStr = assembledBars.slice(1).map((b) => b.join(' ')).join(' ');
        const replacement = bar0Str + existingBarlineMatch[1] + restBarsStr;
        return (
          melodyText.slice(0, replaceStart) +
          replacement +
          (afterBarline.startsWith(' ') || afterBarline.startsWith('\n') ? '' : ' ') +
          afterBarline
        );
      }
    }

    const barSep = hadBarlineInside ? ' | ' : ' ';
    const assembled = assembledBars.map((b) => b.join(' ')).join(barSep);
    return melodyText.slice(0, replaceStart) + assembled + textAfter;
  }
}

/**
 * Full Global Re-Barring Engine:
 * Re-bars melodyText upon editing a note's duration or pitch.
 * 1. Upstream (before the edited note) is 100% byte-for-byte identical.
 * 2. The target note's duration/pitch is updated.
 * 3. Downstream barlines '|' are placed every measureDuration beats according to time signature.
 * 4. Notes crossing barlines are split with ties ('~ |'), and notes no longer crossing bars are merged.
 */
export function rebarMelodyWithDurationEdit(
  melodyText: string,
  targetSpan: SourceSpan,
  newDuration: number,
  newPitch?: string
): string {
  if (targetSpan.start < 0 || targetSpan.end > melodyText.length) {
    return melodyText;
  }
  if (newPitch && !isValidPitchString(newPitch)) {
    return melodyText;
  }

  // Determine measure duration and time signature from <time>
  let measureDuration = 4;
  let parsedTime: ParsedTime = { upper: 4, lower: 4 };
  const timeMatch = melodyText.match(/<time>\s*([^\r\n]+)/);
  if (timeMatch) {
    try {
      parsedTime = parseTime(timeMatch[1]);
      if (parsedTime.upper > 0 && parsedTime.lower > 0) {
        measureDuration = (parsedTime.upper / parsedTime.lower) * 4;
      }
    } catch {
      const timeParts = timeMatch[1].trim().split(/\s+/)[0].split('/');
      if (timeParts.length === 2) {
        const u = parseInt(timeParts[0], 10);
        const l = parseInt(timeParts[1], 10);
        if (u > 0 && l > 0) {
          measureDuration = (u / l) * 4;
          parsedTime = { upper: u, lower: l };
        }
      }
    }
  }

  // Parse non-whitespace musical characters and map offsets to melodyText
  const patternPitch = "[#$%]?[0-9a-zA-Z][',]*";
  const patternPitches = `\\[(?:${patternPitch})+\\]`;
  const patternDuration = '(?:[_=]+|-*)\\.*(?:/3)?';
  const regex = new RegExp(
    `(~?)(${patternPitch}|${patternPitches})(${patternDuration})(~?)`,
    'g'
  );

  let s = '';
  const sOffsetMap: number[] = [];
  let lineOffset = 0;
  const rawLines = melodyText.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    const nlMatch = melodyText.slice(lineOffset + rawLine.length).match(/^(\r?\n)/);
    const nlLen = nlMatch ? nlMatch[0].length : 1;

    if (
      !trimmed ||
      trimmed === 'break' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('<')
    ) {
      lineOffset += rawLine.length + nlLen;
      continue;
    }

    for (let c = 0; c < rawLine.length; c++) {
      const ch = rawLine[c];
      if (!/\s/.test(ch)) {
        s += ch;
        sOffsetMap.push(lineOffset + c);
      }
    }
    lineOffset += rawLine.length + nlLen;
  }

  // Parse notes from s with bars
  const parsedNotes: ParsedMelodyNoteItem[] = [];
  const bars = s.split('|');
  let currentPosInS = 0;

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b];
    const barStartInS = currentPosInS;
    currentPosInS += bar.length + 1; // +1 for '|'

    if (!bar) continue;

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(bar)) !== null) {
      const matchStartInBar = match.index;
      const matchLen = match[0].length;
      const leadingTie = match[1] !== '';
      const pitchesRaw = match[2];
      const durationStr = match[3];
      const trailingTie = match[4] !== '';

      const isBracketed = pitchesRaw.startsWith('[') && pitchesRaw.endsWith(']');
      const dur =
        parsedTime.hyphen && !isBracketed
          ? ((durationStr.match(/-/g) || []).length + 1) / Math.floor(parsedTime.hyphen / 4)
          : parseDurationString(durationStr);
      const innerPitches = pitchesRaw.replace(/^\[|\]$/g, '');
      const pitchMatches = innerPitches.match(new RegExp(patternPitch, 'g')) || [];

      const tokenStartInS = barStartInS + matchStartInBar;
      const tokenEndInS = tokenStartInS + matchLen - 1;
      const tokenStartInMelody = sOffsetMap[tokenStartInS];
      const tokenEndInMelody = sOffsetMap[tokenEndInS] + 1;

      let currentPitchOffsetInRaw = isBracketed ? 1 : 0;
      for (let k = 0; k < pitchMatches.length; k++) {
        const p = pitchMatches[k];
        const pitchPosInRaw = pitchesRaw.indexOf(p, currentPitchOffsetInRaw);
        const pitchStartInBar =
          matchStartInBar + match[1].length + (pitchPosInRaw >= 0 ? pitchPosInRaw : 0);
        const pitchStartInS = barStartInS + pitchStartInBar;
        const pitchEndInS = pitchStartInS + p.length - 1;

        if (pitchPosInRaw >= 0) {
          currentPitchOffsetInRaw = pitchPosInRaw + p.length;
        }

        parsedNotes.push({
          pitch: p,
          duration: dur,
          pitchStart: sOffsetMap[pitchStartInS],
          pitchEnd: sOffsetMap[pitchEndInS] + 1,
          tokenStart: tokenStartInMelody,
          tokenEnd: tokenEndInMelody,
          leadingTie: k === 0 ? leadingTie : false,
          trailingTie: k === pitchMatches.length - 1 ? trailingTie : false,
          barIndex: b,
        });
      }
    }
  }

  if (parsedNotes.length === 0) {
    return melodyText;
  }

  // Find target note
  const targetIdx = parsedNotes.findIndex(
    (n) =>
      n.pitchStart === targetSpan.start ||
      (n.pitchStart <= targetSpan.start && targetSpan.start < n.pitchEnd)
  );

  if (targetIdx === -1) {
    return melodyText;
  }

  const activeKey = extractMelodyKeyAt(melodyText, parsedNotes[targetIdx].pitchStart);

  // Handle tied notes belonging to the same unit (walking both backward and forward)
  let startTargetIdx = targetIdx;
  while (startTargetIdx > 0) {
    const prev = parsedNotes[startTargetIdx - 1];
    const cur = parsedNotes[startTargetIdx];
    if (
      (prev.trailingTie || cur.leadingTie) &&
      areSameTiedPitch(prev.pitch, cur.pitch, activeKey)
    ) {
      startTargetIdx--;
    } else {
      break;
    }
  }

  let endTargetIdx = targetIdx;
  while (endTargetIdx + 1 < parsedNotes.length) {
    const cur = parsedNotes[endTargetIdx];
    const next = parsedNotes[endTargetIdx + 1];
    if (
      (cur.trailingTie || next.leadingTie) &&
      areSameTiedPitch(cur.pitch, next.pitch, activeKey)
    ) {
      endTargetIdx++;
    } else {
      break;
    }
  }

  let oldDuration = 0;
  for (let i = startTargetIdx; i <= endTargetIdx; i++) {
    oldDuration += parsedNotes[i].duration;
  }

  const rawFinalPitch = newPitch || parsedNotes[startTargetIdx].pitch;
  const finalPitch = normalizePitchString(rawFinalPitch.trim());
  if (Math.abs(oldDuration - newDuration) < 1e-6) {
    if (!newPitch) {
      return melodyText;
    }
    const allSame = parsedNotes
      .slice(startTargetIdx, endTargetIdx + 1)
      .every((n) => n.pitch === finalPitch);
    if (allSame) {
      return melodyText;
    }
    return spliceMelodyPitch(melodyText, targetSpan, finalPitch);
  }

  // Find group start if startTargetIdx is inside a multi-note token (e.g. bracketed group)
  let groupStartIdx = startTargetIdx;
  while (
    groupStartIdx > 0 &&
    parsedNotes[groupStartIdx - 1].tokenStart === parsedNotes[startTargetIdx].tokenStart
  ) {
    groupStartIdx--;
  }

  // Compute beat offset within current measure up to the start of the edited group
  const targetBarIdx = parsedNotes[groupStartIdx].barIndex;
  const startBeatInBar =
    parsedNotes
      .filter((n, i) => i < groupStartIdx && n.barIndex === targetBarIdx)
      .reduce((sum, n) => sum + n.duration, 0) % measureDuration;

  // Upstream text remains 100% byte-for-byte identical
  const upstreamEnd = parsedNotes[groupStartIdx].tokenStart;
  const upstreamText = melodyText.slice(0, upstreamEnd);

  // Build stream of notes to re-bar
  interface StreamNote {
    pitch: string;
    duration: number;
  }
  const stream: StreamNote[] = [];

  // Prepend any notes from the same group that precede startTargetIdx
  for (let p = groupStartIdx; p < startTargetIdx; p++) {
    stream.push({
      pitch: parsedNotes[p].pitch,
      duration: parsedNotes[p].duration,
    });
  }

  // Add target note (with new pitch and/or new duration)
  stream.push({ pitch: finalPitch, duration: newDuration });

  let curIdx = endTargetIdx + 1;
  while (curIdx < parsedNotes.length) {
    const firstOfUnit = parsedNotes[curIdx];
    const unitKey = extractMelodyKeyAt(melodyText, firstOfUnit.pitchStart);
    let noteDur = firstOfUnit.duration;
    while (curIdx + 1 < parsedNotes.length) {
      const prev = parsedNotes[curIdx];
      const next = parsedNotes[curIdx + 1];
      if (
        (prev.trailingTie || next.leadingTie) &&
        areSameTiedPitch(prev.pitch, next.pitch, unitKey)
      ) {
        noteDur += next.duration;
        curIdx++;
      } else {
        break;
      }
    }
    stream.push({ pitch: firstOfUnit.pitch, duration: noteDur });
    curIdx++;
  }

  // Re-bar notes starting from target note using metric subdivision
  let currentBeat = startBeatInBar;
  const rebarredBars: string[][] = [[]];

  for (const n of stream) {
    const { bars, endBeatInBar } = decomposeNoteAcrossBars(
      n.pitch,
      n.duration,
      currentBeat,
      parsedTime
    );

    for (let b = 0; b < bars.length; b++) {
      if (b === 0) {
        rebarredBars[rebarredBars.length - 1].push(...bars[b]);
      } else {
        rebarredBars.push([...bars[b]]);
      }
    }
    currentBeat = endBeatInBar;
    if (Math.abs(currentBeat) < 1e-6 && bars[bars.length - 1].length > 0) {
      rebarredBars.push([]);
    }
  }

  while (
    rebarredBars.length > 0 &&
    rebarredBars[rebarredBars.length - 1].length === 0
  ) {
    rebarredBars.pop();
  }

  let effectiveUpstreamText = upstreamText;
  const firstStreamIsRest =
    stream.length > 0 && (stream[0].pitch === '0' || stream[0].pitch === 'o');
  if (firstStreamIsRest) {
    effectiveUpstreamText = effectiveUpstreamText.replace(/~([ \t]*)$/, '$1');
  } else if (
    parsedNotes[groupStartIdx].leadingTie &&
    !effectiveUpstreamText.trimEnd().endsWith('~') &&
    rebarredBars.length > 0 &&
    rebarredBars[0].length > 0
  ) {
    rebarredBars[0][0] = '~' + rebarredBars[0][0];
  }

  // Format downstream text
  let downstreamText = '';
  for (let b = 0; b < rebarredBars.length; b++) {
    const barTokens = rebarredBars[b].join(' ');
    if (b === 0) {
      downstreamText += barTokens;
    } else {
      const isLineBreak = b % 2 === 0;
      downstreamText += isLineBreak ? ' |\n' + barTokens : ' | ' + barTokens;
    }
  }

  if (rebarredBars.length > 0) {
    downstreamText += ' |\n';
  }

  // Join upstream and downstream
  let result = effectiveUpstreamText;
  if (downstreamText) {
    if (result.length > 0 && !result.endsWith(' ') && !result.endsWith('\n') && !downstreamText.startsWith(' ')) {
      result += ' ';
    }
    result += downstreamText;
  }

  return result;
}

export interface BreakLineResult {
  lyricsText: string;
  melodyText: string;
}

/**
 * High-level helper to execute a synchronized line break from the right slide canvas (Op 1: Split Line):
 * 1. Inserts a line break in lyricsText before targetNode.
 * 2. If a trailing rest exists at the end of the line, toggles '0' to 'o' in melodyText.
 */
export function performSynchronizedLineBreak(
  lyricsText: string,
  melodyText: string,
  targetNode: NodeElement,
  trailingRestNode?: NodeElement | null
): BreakLineResult {
  let newLyrics = lyricsText;
  let newMelody = melodyText;

  if (targetNode.lyricSpan) {
    newLyrics = spliceLyricLineBreakBefore(lyricsText, targetNode.lyricSpan);
  }

  if (
    trailingRestNode?.melodySpan &&
    trailingRestNode.value instanceof Note &&
    trailingRestNode.value.isRest
  ) {
    newMelody = spliceMelodyTrailingRest(melodyText, trailingRestNode.melodySpan, true);
  }

  return { lyricsText: newLyrics, melodyText: newMelody };
}

/**
 * High-level helper to merge a line with its following line (Full Line Merge).
 * Removes the line break following lineEndNode.
 */
export function performSynchronizedLineMerge(
  lyricsText: string,
  melodyText: string,
  lineEndNode: NodeElement
): BreakLineResult {
  let newLyrics = lyricsText;
  if (lineEndNode.lyricSpan) {
    newLyrics = spliceRemoveLyricLineBreak(lyricsText, lineEndNode.lyricSpan);
  }
  return { lyricsText: newLyrics, melodyText };
}

/**
 * High-level helper to flow trailing units from current line into the next line (Op 2: Flow to Next).
 * Moves units starting from fromNode into the beginning of the next line.
 * prevNode is the node immediately before fromNode on the current line.
 */
export function performSynchronizedFlowToNext(
  lyricsText: string,
  melodyText: string,
  prevNode: NodeElement,
  lineEndNode: NodeElement
): BreakLineResult {
  if (!prevNode.lyricSpan || !lineEndNode.lyricSpan) {
    return { lyricsText, melodyText };
  }
  const mergedLyrics = spliceRemoveLyricLineBreak(lyricsText, lineEndNode.lyricSpan);
  const newLyrics = spliceLyricLineBreak(mergedLyrics, prevNode.lyricSpan);
  return { lyricsText: newLyrics, melodyText };
}

/**
 * High-level helper to flow leading units from current line into the previous line (Op 3: Flow to Prev).
 * Moves leading units up to upToNode into the end of the previous line.
 */
export function performSynchronizedFlowToPrev(
  lyricsText: string,
  melodyText: string,
  upToNode: NodeElement,
  prevLineEndNode: NodeElement
): BreakLineResult {
  if (!upToNode.lyricSpan || !prevLineEndNode.lyricSpan) {
    return { lyricsText, melodyText };
  }
  const mergedLyrics = spliceRemoveLyricLineBreak(lyricsText, prevLineEndNode.lyricSpan);
  const diff = lyricsText.length - mergedLyrics.length;
  const adjustedSpan: SourceSpan = {
    start: upToNode.lyricSpan.start - diff,
    end: upToNode.lyricSpan.end - diff,
  };
  const newLyrics = spliceLyricLineBreak(mergedLyrics, adjustedSpan);
  return { lyricsText: newLyrics, melodyText };
}

/**
 * Surgically updates or inserts title slide metadata directives (<title>, <subtitle>, <album>, <credits>)
 * into lyricsText while preserving formatting and subsequent lines.
 */
export function updateLyricsMetadata(
  lyricsText: string,
  newMetadata: Partial<SongMetadata>
): string {
  const isCrlf = lyricsText.includes('\r\n');
  const eol = isCrlf ? '\r\n' : '\n';
  const lines = lyricsText.split(/\r?\n/);

  // Field to directive name mapping in standard order
  const fields: { key: keyof SongMetadata; tag: string }[] = [
    { key: 'title', tag: 'title' },
    { key: 'subtitle', tag: 'subtitle' },
    { key: 'album', tag: 'album' },
    { key: 'credits', tag: 'credits' },
  ];

  // Map existing directive locations in lines
  const directiveIndices = new Map<keyof SongMetadata, number>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^<(title|subtitle|album|credits)>(.*)$/i);
    if (match) {
      const tag = match[1].toLowerCase();
      if (tag === 'title' && !directiveIndices.has('title')) directiveIndices.set('title', i);
      else if (tag === 'subtitle' && !directiveIndices.has('subtitle')) directiveIndices.set('subtitle', i);
      else if (tag === 'album' && !directiveIndices.has('album')) directiveIndices.set('album', i);
      else if (tag === 'credits' && !directiveIndices.has('credits')) {
        directiveIndices.set('credits', i);
      }
    }
  }

  const resultLines = [...lines];

  for (const { key, tag } of fields) {
    if (newMetadata[key] === undefined) continue;

    let val = newMetadata[key]?.trim() ?? '';
    if (key === 'title' || key === 'subtitle' || key === 'credits') {
      val = val.replace(/\r?\n/g, '\\n');
    }
    const existingIdx = directiveIndices.get(key);
    const tagRe = new RegExp(`^<${tag}>`, 'i');

    if (existingIdx !== undefined) {
      if (val) {
        resultLines[existingIdx] = `<${tag}> ${val}`;
      } else {
        resultLines.splice(existingIdx, 1);
        for (const [k, idx] of directiveIndices.entries()) {
          if (idx > existingIdx) directiveIndices.set(k, idx - 1);
        }
        directiveIndices.delete(key);
      }
      // Remove any extra repeated lines for the same directive (e.g. duplicate <credits>)
      const startScan = val ? existingIdx + 1 : existingIdx;
      for (let r = resultLines.length - 1; r >= startScan; r--) {
        if (tagRe.test(resultLines[r].trim())) {
          resultLines.splice(r, 1);
          for (const [k, idx] of directiveIndices.entries()) {
            if (idx > r) directiveIndices.set(k, idx - 1);
          }
        }
      }
    } else if (val) {
      let highestExisting = -1;
      for (const idx of directiveIndices.values()) {
        if (idx > highestExisting) highestExisting = idx;
      }
      const insertIdx = highestExisting >= 0 ? highestExisting + 1 : 0;

      resultLines.splice(insertIdx, 0, `<${tag}> ${val}`);
      for (const [k, idx] of directiveIndices.entries()) {
        if (idx >= insertIdx) directiveIndices.set(k, idx + 1);
      }
      directiveIndices.set(key, insertIdx);
    }
  }

  return resultLines.join(eol);
}

