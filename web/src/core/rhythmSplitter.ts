import { Fraction, Note, type TimeSignature } from './types';

export interface ParsedTime extends TimeSignature {
  upper: number;
  lower: number;
  hyphen?: number;
}

const possibleEndsCache: Map<string, number[][]> = new Map();

export function initPossibleEnds(n: number, m: number): number[][] {
  const cacheKey = `${n},${m}`;
  if (possibleEndsCache.has(cacheKey)) {
    return possibleEndsCache.get(cacheKey)!;
  }
  const num = m << n;
  const ends: Set<number>[] = Array.from({ length: num }, () => new Set());

  // k < n
  for (let k = 0; k < n; k++) {
    for (let a = 0; a < num; a += 1 << k) {
      let start = a;
      let end = a + (1 << k);
      if (end > num) break;
      ends[start].add(end);
      if ((a >> k) % 2 === 0 && k > 0 && end + (1 << (k - 1)) < num) {
        ends[start + (1 << (k - 1))].add(end + (1 << (k - 1)));
      }
      if ((a >> k) % 2 === 1) {
        for (let j = k - 1; j >= 0; j--) {
          start -= 1 << j;
          if (start < 0) break;
          ends[start].add(end);
        }
      } else {
        for (let j = k - 1; j >= 0; j--) {
          end += 1 << j;
          if (end > num) break;
          ends[start].add(end);
        }
      }
    }
  }

  // k >= n
  const mBitLength = Math.floor(Math.log2(m)) + 1;
  for (let k = n; k < n + mBitLength; k++) {
    for (let a = 0; a < num; a += 1 << n) {
      let start = a;
      let end = a + (1 << k);
      if (end > num) break;
      ends[start].add(end);
      if (k > 0 && end + (1 << (k - 1)) < num) {
        ends[start + (1 << (k - 1))].add(end + (1 << (k - 1)));
      }
      for (let j = k - 1; j >= 0; j--) {
        start -= 1 << j;
        if (start < 0) break;
        ends[start].add(end);
      }
      start = a;
      for (let j = k - 1; j >= 0; j--) {
        end += 1 << j;
        if (end > num) break;
        ends[start].add(end);
      }
    }
  }

  const sortedEnds = ends.map((s) => Array.from(s).sort((x, y) => x - y));
  possibleEndsCache.set(cacheKey, sortedEnds);
  return sortedEnds;
}

export function splitNote(time: ParsedTime, startBeat: Fraction, note: Note): Note[] {
  if (!time.hyphen) {
    throw new Error(`no need to split note for time`);
  }
  if (!time.upper) {
    throw new Error(`cannot split note for time ?/${time.lower}`);
  }
  note.lines = null;
  note.dots = null;
  const duration = note.duration;
  const p = Math.floor(Math.log2(time.hyphen)) + 1 - 3;

  let unit: number;
  let n: number;
  let m: number;
  let nUnit: number;
  let mUnit: number;

  if (time.lower === 4) {
    unit = 1 << p;
    if (time.upper === 2) {
      n = p + 1;
      m = 1;
    } else if (time.upper === 3) {
      n = p;
      m = 3;
    } else if (time.upper === 4) {
      n = p + 2;
      m = 1;
    } else {
      throw new Error(`unknown time.upper ${time.upper}`);
    }
    nUnit = 0;
    mUnit = time.upper;
  } else {
    unit = Math.floor((3 / 2) * (1 << p));
    n = p - 1;
    m = 3;
    if (time.upper === 6) {
      nUnit = 0;
      mUnit = 2;
    } else if (time.upper === 9) {
      nUnit = 0;
      mUnit = 3;
    } else if (time.upper === 12) {
      nUnit = 2;
      mUnit = 1;
    } else {
      throw new Error(`unknown time.upper ${time.upper}`);
    }
  }

  const ends = initPossibleEnds(n, m);
  const endsUnit = initPossibleEnds(nUnit, mUnit);
  const end = Math.round(startBeat.add(duration).toNumber() * (1 << p));
  const subnotes: Note[] = [];
  let beat = startBeat;

  while (beat.lessThan(startBeat.add(duration))) {
    const start = Math.round(beat.toNumber() * (1 << p));
    let subend: number | null = null;

    if (start % unit === 0) {
      const uIdx = Math.floor(start / unit);
      if (uIdx < endsUnit.length) {
        for (const eRel of endsUnit[uIdx]) {
          const e = eRel * unit;
          if (e > end) break;
          if (time.lower === 8 && e !== start + unit) continue;
          subend = e;
        }
      }
    }

    const base = start - (start % (1 << n));
    const rem = start % (1 << n);
    if (rem < ends.length) {
      for (const eRel of ends[rem]) {
        const e = base + eRel;
        if (e > end) break;
        const length = e - start;
        if (
          (time.lower === 4 && length >= unit * 2) ||
          (time.lower === 8 && length > unit)
        ) {
          break;
        }
        if (subend === null || e > subend) {
          subend = e;
        }
      }
    }

    if (subend === null) {
      throw new Error(`cannot find ending point in (${start}, ${end}]`);
    }

    const endBeat = new Fraction(subend, 1 << p);
    const subnote = note.copy();
    subnote.duration = endBeat.sub(beat);

    if (subnotes.length === 0) {
      if (!endBeat.equals(startBeat.add(duration))) {
        subnote.tie[1] = true;
      }
    } else {
      subnote.tie[0] = true;
    }
    subnotes.push(subnote);
    beat = endBeat;
  }

  for (let i = 0; i < subnotes.length; i++) {
    const subnote = subnotes[i];
    if (note.isRest) {
      subnote.tie[0] = false;
      subnote.tie[1] = false;
    } else {
      if (i > 0) subnote.tie[0] = true;
      if (i < subnotes.length - 1) subnote.tie[1] = true;
    }
  }

  return subnotes;
}

/**
 * Formats a single primitive note duration into standard numbered musical notation syntax.
 */
export function formatSingleNoteToken(pitch: string, dur: number): string {
  const rounded = Math.round(dur * 32) / 32;
  if (rounded >= 4) {
    const extra = Math.round(rounded - 1);
    return pitch + ' ' + Array(extra).fill('-').join(' ');
  }
  if (rounded === 3) return pitch + ' - -';
  if (rounded === 2) return pitch + ' -';
  if (rounded === 1.5) return pitch + '.';
  if (rounded === 1) return pitch;
  if (rounded === 0.75) return pitch + '_.';
  if (rounded === 0.5) return pitch + '_';
  if (rounded === 0.375) return pitch + '=.';
  if (rounded === 0.25) return pitch + '=';
  if (rounded === 0.125) return pitch + '=_';
  if (rounded === 0.0625) return pitch + '==';

  // Fallback for compound durations if called directly outside splitNote
  if (rounded > 1) {
    const intPart = Math.floor(rounded);
    const fracPart = rounded - intPart;
    if (fracPart === 0) {
      return pitch + ' ' + Array(intPart - 1).fill('-').join(' ');
    }
    return (
      formatSingleNoteToken(pitch, intPart) +
      ' ~ ' +
      formatSingleNoteToken(pitch, fracPart)
    );
  }
  return pitch;
}

/**
 * Decomposes a musical note with pitch and totalDuration starting at startBeatInBar
 * across one or more bars using metric subdivision (`splitNote`).
 *
 * Returns an array of bars, where each bar contains the array of formatted tokens.
 * A note that extends across a barline or is partitioned by metric divisions has
 * appropriate ties (~).
 */
export function decomposeNoteAcrossBars(
  pitch: string,
  totalDuration: number,
  startBeatInBar: number,
  time: ParsedTime = { upper: 4, lower: 4, hyphen: 32 }
): { bars: string[][]; endBeatInBar: number } {
  const measureDuration = (time.upper / time.lower) * 4;
  const timeWithHyphen: ParsedTime = {
    ...time,
    hyphen: time.hyphen || 32,
  };

  let currentBeat = startBeatInBar;
  let remainingDur = totalDuration;
  const bars: string[][] = [[]];

  while (remainingDur > 1e-6) {
    const spaceLeft = measureDuration - currentBeat;
    const chunkDur = Math.min(remainingDur, spaceLeft);
    const isCrossingBarline = remainingDur > spaceLeft + 1e-6;

    // Use splitNote to partition chunkDur within current bar
    const dummyNote = new Note(null, 1, 0, new Fraction(Math.round(chunkDur * 32), 32));
    const startFrac = new Fraction(Math.round(currentBeat * 32), 32);
    const subnotes = splitNote(timeWithHyphen, startFrac, dummyNote);

    for (let i = 0; i < subnotes.length; i++) {
      const sn = subnotes[i];
      const snDur = sn.duration.toNumber();
      let token = formatSingleNoteToken(pitch, snDur);
      // Tie if splitNote ties internally or if this subnote crosses the barline
      const needsTie =
        sn.tie[1] || (i === subnotes.length - 1 && isCrossingBarline);
      if (needsTie) {
        token += ' ~';
      }
      bars[bars.length - 1].push(token);
    }

    remainingDur -= chunkDur;
    if (isCrossingBarline) {
      currentBeat = 0;
      bars.push([]);
    } else {
      currentBeat = (currentBeat + chunkDur) % measureDuration;
      if (Math.abs(currentBeat) < 1e-6 && remainingDur > 1e-6) {
        bars.push([]);
      }
    }
  }

  return { bars, endBeatInBar: currentBeat };
}
