import { KeySignature, parsePitch, parseTime } from './parserClassic';
import { NodeElement, Note, SourceSpan } from './types';
import {
  formatSingleNoteToken,
  decomposeNoteAcrossBars,
  type ParsedTime,
} from './rhythmSplitter';

export { formatSingleNoteToken, decomposeNoteAcrossBars };

/**
 * Punctuation characters commonly found attached to lyric syllables.
 */
const LYRIC_PUNCTUATION_CHARS = ',.!?　。，、！？;；:：~';

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
  melodySpan: SourceSpan,
  newPitch: string
): string {
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

/**
 * Strategy A: Minimal In-Place Duration Edit.
 * Surgically replaces only the target note's token (including attached dashes/modifiers
 * or tied continuation notes within the same bar, or within its bracket) in melodyText.
 * Existing '|' barlines, other notes, line breaks, comments, and downstream text remain
 * 100% byte-for-byte identical.
 */
export function spliceMelodyNoteDuration(
  melodyText: string,
  targetSpan: SourceSpan,
  newDuration?: number,
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
  let parsedTime: ParsedTime = { upper: 4, lower: 4, hyphen: 32 };
  const timeMatch = melodyText.match(/<time>\s*([^\r\n]+)/);
  if (timeMatch) {
    parsedTime = parseTime(timeMatch[1]);
    if (parsedTime.upper > 0 && parsedTime.lower > 0) {
      measureDuration = (parsedTime.upper / parsedTime.lower) * 4;
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

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('<')) {
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

      const dur = parseDurationString(durationStr);
      const isBracketed = pitchesRaw.startsWith('[') && pitchesRaw.endsWith(']');
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

  // Handle bracketed notes
  if (targetNote.isBracketed) {
    let groupStartIdx = targetIdx;
    while (
      groupStartIdx > 0 &&
      parsedNotes[groupStartIdx - 1].tokenStart === targetNote.tokenStart
    ) {
      groupStartIdx--;
    }

    let groupEndIdx = targetIdx;
    while (
      groupEndIdx + 1 < parsedNotes.length &&
      parsedNotes[groupEndIdx + 1].tokenStart === targetNote.tokenStart
    ) {
      groupEndIdx++;
    }

    const groupNotes = parsedNotes.slice(groupStartIdx, groupEndIdx + 1);
    const idxInGroup = targetIdx - groupStartIdx;

    const targetDur = newDuration !== undefined ? newDuration : targetNote.duration;

    // Check if unchanged
    if (
      Math.abs(targetNote.duration - targetDur) < 1e-6 &&
      finalPitch === targetNote.pitch
    ) {
      return melodyText;
    }

    // If duration didn't change, only pitch changed inside bracket
    if (Math.abs(targetNote.duration - targetDur) < 1e-6) {
      const newPitches = groupNotes.map((n, i) => (i === idxInGroup ? finalPitch : n.pitch));
      let replacement = '[' + newPitches.join('') + ']' + targetNote.durationStr;
      if (parsedNotes[groupStartIdx].leadingTie) replacement = '~' + replacement;
      if (parsedNotes[groupEndIdx].trailingTie) replacement = replacement + '~';
      return (
        melodyText.slice(0, targetNote.tokenStart) +
        replacement +
        melodyText.slice(targetNote.tokenEnd)
      );
    }

    // Duration changed: extract target note from bracket
    const beforeNotes = groupNotes.slice(0, idxInGroup);
    const afterNotes = groupNotes.slice(idxInGroup + 1);

    const spaceLeftInBar = measureDuration - targetNote.startBeatInBar;
    const crossesBar = targetDur > spaceLeftInBar + 1e-6;

    if (!crossesBar) {
      const parts: string[] = [];

      if (beforeNotes.length === 1) {
        parts.push(formatSingleNoteToken(beforeNotes[0].pitch, beforeNotes[0].duration));
      } else if (beforeNotes.length > 1) {
        parts.push('[' + beforeNotes.map((n) => n.pitch).join('') + ']' + targetNote.durationStr);
      }

      parts.push(formatSingleNoteToken(finalPitch, targetDur));

      if (afterNotes.length === 1) {
        parts.push(formatSingleNoteToken(afterNotes[0].pitch, afterNotes[0].duration));
      } else if (afterNotes.length > 1) {
        parts.push('[' + afterNotes.map((n) => n.pitch).join('') + ']' + targetNote.durationStr);
      }

      if (parsedNotes[groupStartIdx].leadingTie && parts.length > 0) {
        parts[0] = '~' + parts[0];
      }
      if (parsedNotes[groupEndIdx].trailingTie && parts.length > 0) {
        parts[parts.length - 1] = parts[parts.length - 1] + '~';
      }

      const replacement = parts.join(' ');
      return (
        melodyText.slice(0, targetNote.tokenStart) +
        replacement +
        melodyText.slice(targetNote.tokenEnd)
      );
    } else {
      // Note crosses barline: break note across bars
      const { bars: noteBars } = decomposeNoteAcrossBars(
        finalPitch,
        targetDur,
        targetNote.startBeatInBar,
        parsedTime
      );

      const bar0Tokens: string[] = [];
      if (beforeNotes.length === 1) {
        bar0Tokens.push(formatSingleNoteToken(beforeNotes[0].pitch, beforeNotes[0].duration));
      } else if (beforeNotes.length > 1) {
        bar0Tokens.push('[' + beforeNotes.map((n) => n.pitch).join('') + ']' + targetNote.durationStr);
      }
      bar0Tokens.push(...noteBars[0]);
      if (parsedNotes[groupStartIdx].leadingTie && bar0Tokens.length > 0) {
        bar0Tokens[0] = '~' + bar0Tokens[0];
      }

      const lastBarIdx = noteBars.length - 1;
      const lastBarTokens: string[] = [...noteBars[lastBarIdx]];
      if (afterNotes.length === 1) {
        lastBarTokens.push(formatSingleNoteToken(afterNotes[0].pitch, afterNotes[0].duration));
      } else if (afterNotes.length > 1) {
        lastBarTokens.push('[' + afterNotes.map((n) => n.pitch).join('') + ']' + targetNote.durationStr);
      }
      if (parsedNotes[groupEndIdx].trailingTie && lastBarTokens.length > 0) {
        lastBarTokens[lastBarTokens.length - 1] = lastBarTokens[lastBarTokens.length - 1] + '~';
      }

      const assembledBars: string[] = [bar0Tokens.join(' ')];
      for (let b = 1; b < lastBarIdx; b++) {
        assembledBars.push(noteBars[b].join(' '));
      }
      assembledBars.push(lastBarTokens.join(' '));

      const textAfter = melodyText.slice(targetNote.tokenEnd);
      const existingBarlineMatch = textAfter.match(/^([ \t]*\|[ \t]*)/);
      if (existingBarlineMatch) {
        const afterBarline = textAfter.slice(existingBarlineMatch[0].length);
        const replacement =
          assembledBars[0] + existingBarlineMatch[1] + assembledBars.slice(1).join(' | ');
        return (
          melodyText.slice(0, targetNote.tokenStart) +
          replacement +
          (afterBarline.startsWith(' ') || afterBarline.startsWith('\n') ? '' : ' ') +
          afterBarline
        );
      } else {
        const replacement = assembledBars.join(' | ');
        return (
          melodyText.slice(0, targetNote.tokenStart) +
          replacement +
          textAfter
        );
      }
    }
  }

  // Handle single note (non-bracketed)
  // Check for tied continuation notes belonging to the same unit
  let endTargetIdx = targetIdx;
  let oldDuration = targetNote.duration;
  while (endTargetIdx + 1 < parsedNotes.length) {
    const cur = parsedNotes[endTargetIdx];
    const next = parsedNotes[endTargetIdx + 1];
    if ((cur.trailingTie || next.leadingTie) && cur.pitch === next.pitch) {
      oldDuration += next.duration;
      endTargetIdx++;
    } else {
      break;
    }
  }

  const targetDur = newDuration !== undefined ? newDuration : oldDuration;

  if (
    Math.abs(oldDuration - targetDur) < 1e-6 &&
    finalPitch === targetNote.pitch
  ) {
    return melodyText;
  }

  const spaceLeftInBar = measureDuration - targetNote.startBeatInBar;
  const crossesBar = targetDur > spaceLeftInBar + 1e-6;
  const replaceStart = targetNote.tokenStart;
  const replaceEnd = parsedNotes[endTargetIdx].tokenEnd;

  if (!crossesBar) {
    let replacement = formatSingleNoteToken(finalPitch, targetDur);
    if (targetNote.leadingTie) {
      replacement = '~' + replacement;
    }
    if (parsedNotes[endTargetIdx].trailingTie) {
      replacement = replacement + '~';
    }

    if (targetNote.barIndex !== parsedNotes[endTargetIdx].barIndex) {
      const textBetween = melodyText.slice(targetNote.tokenEnd, parsedNotes[endTargetIdx].tokenStart);
      if (textBetween.includes('|')) {
        replacement = replacement + ' |';
      }
    }

    return melodyText.slice(0, replaceStart) + replacement + melodyText.slice(replaceEnd);
  } else {
    // Crosses barline
    const { bars: noteBars } = decomposeNoteAcrossBars(
      finalPitch,
      targetDur,
      targetNote.startBeatInBar,
      parsedTime
    );

    if (targetNote.leadingTie && noteBars[0].length > 0) {
      noteBars[0][0] = '~' + noteBars[0][0];
    }
    if (parsedNotes[endTargetIdx].trailingTie) {
      const lastB = noteBars[noteBars.length - 1];
      if (lastB.length > 0) {
        lastB[lastB.length - 1] = lastB[lastB.length - 1] + '~';
      }
    }

    const textAfter = melodyText.slice(replaceEnd);
    const hadBarlineInside = targetNote.barIndex !== parsedNotes[endTargetIdx].barIndex;

    if (!hadBarlineInside) {
      const existingBarlineMatch = textAfter.match(/^([ \t]*\|[ \t]*)/);
      if (existingBarlineMatch) {
        const afterBarline = textAfter.slice(existingBarlineMatch[0].length);
        const bar0Str = noteBars[0].join(' ');
        const restBarsStr = noteBars.slice(1).map((b) => b.join(' ')).join(' | ');
        const replacement = bar0Str + existingBarlineMatch[1] + restBarsStr;
        return (
          melodyText.slice(0, replaceStart) +
          replacement +
          (afterBarline.startsWith(' ') || afterBarline.startsWith('\n') ? '' : ' ') +
          afterBarline
        );
      }
    }

    const assembled = noteBars.map((b) => b.join(' ')).join(' | ');
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
  let parsedTime: ParsedTime = { upper: 4, lower: 4, hyphen: 32 };
  const timeMatch = melodyText.match(/<time>\s*([^\r\n]+)/);
  if (timeMatch) {
    const timeParts = timeMatch[1].trim().split(/\s+/)[0].split('/');
    if (timeParts.length === 2) {
      const u = parseInt(timeParts[0], 10);
      const l = parseInt(timeParts[1], 10);
      if (u > 0 && l > 0) {
        measureDuration = (u / l) * 4;
        parsedTime = { upper: u, lower: l, hyphen: 32 };
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

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('<')) {
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

      const dur = parseDurationString(durationStr);
      const isBracketed = pitchesRaw.startsWith('[') && pitchesRaw.endsWith(']');
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

  // Handle tied continuation notes belonging to the same unit
  let endTargetIdx = targetIdx;
  let oldDuration = parsedNotes[targetIdx].duration;
  while (endTargetIdx + 1 < parsedNotes.length) {
    const cur = parsedNotes[endTargetIdx];
    const next = parsedNotes[endTargetIdx + 1];
    if ((cur.trailingTie || next.leadingTie) && cur.pitch === next.pitch) {
      oldDuration += next.duration;
      endTargetIdx++;
    } else {
      break;
    }
  }

  const rawFinalPitch = newPitch || parsedNotes[targetIdx].pitch;
  const finalPitch = normalizePitchString(rawFinalPitch.trim());
  if (
    Math.abs(oldDuration - newDuration) < 1e-6 &&
    finalPitch === parsedNotes[targetIdx].pitch
  ) {
    return melodyText;
  }

  // Find group start if targetIdx is inside a multi-note token (e.g. bracketed group)
  let groupStartIdx = targetIdx;
  while (
    groupStartIdx > 0 &&
    parsedNotes[groupStartIdx - 1].tokenStart === parsedNotes[targetIdx].tokenStart
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

  // Prepend any notes from the same group that precede targetIdx
  for (let p = groupStartIdx; p < targetIdx; p++) {
    stream.push({
      pitch: parsedNotes[p].pitch,
      duration: parsedNotes[p].duration,
    });
  }

  // Add target note (with new pitch and/or new duration)
  stream.push({ pitch: finalPitch, duration: newDuration });

  let curIdx = endTargetIdx + 1;
  while (curIdx < parsedNotes.length) {
    const cur = parsedNotes[curIdx];
    let noteDur = cur.duration;
    while (curIdx + 1 < parsedNotes.length) {
      const next = parsedNotes[curIdx + 1];
      if ((cur.trailingTie || next.leadingTie) && cur.pitch === next.pitch) {
        noteDur += next.duration;
        curIdx++;
      } else {
        break;
      }
    }
    stream.push({ pitch: cur.pitch, duration: noteDur });
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
  let result = upstreamText;
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
