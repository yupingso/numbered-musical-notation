import {
  Accidental,
  Fraction,
  Note,
  NodeElement,
  NodeType,
  NodeRange,
  OutputLine,
  Section,
  SongAST,
  TimeSignature,
} from './types';

export type KeySignature = 'solfa' | [number, number]; // [pitch (1-7), accidental (-1, 0, 1)]

export interface ParsedTime extends TimeSignature {
  upper: number;
  lower: number;
  hyphen?: number;
}

export function getKeyScale(key: [number, number]): number[] {
  const flat = [0, 7, 3, 6, 2, 5, 1, 4];
  const sharp = [0, 4, 1, 5, 2, 6, 3, 7];
  const [pitch, tmp] = key;

  for (const x of [-1, 1]) {
    const a = new Array(8).fill(0);
    for (let n = 0; n < 8; n++) {
      const p = ((((4 * x * n) % 7) + 7) % 7) + 1;
      let t = 0;
      if (x === -1 && n >= 2) t = -1;
      else if (x === 1 && n >= 6) t = 1;

      if (x === -1) {
        a[flat[n]] = -1;
      } else {
        a[sharp[n]] = 1;
      }

      if (p === pitch && t === tmp) {
        return a;
      }
    }
  }
  return new Array(8).fill(0);
}

export function parseKey(s: string): KeySignature {
  s = s.trim();
  if (!s) throw new Error('Empty key');
  if (s === 'solfa') return 'solfa';

  const sym2key: Record<string, [number, number]> = {};

  for (const x of [-1, 1]) {
    for (let n = 0; n < 8; n++) {
      const pitch = ((((4 * x * n) % 7) + 7) % 7) + 1;
      let tmp = 0;
      if (x === -1 && n >= 2) tmp = -1;
      else if (x === 1 && n >= 6) tmp = 1;
      sym2key[`${n},${x}`] = [pitch, tmp];
    }
  }

  if (/\d/.test(s)) {
    if (s.length === 1) {
      if (s[0] !== '0') throw new Error(`Wrong format for <key> ${s}`);
      return [1, 0];
    }
    if (s.length !== 2 || !'01234567'.includes(s[0]) || !'#$'.includes(s[1])) {
      throw new Error(`Wrong format for <key> ${s}`);
    }
    const x = s[1] === '#' ? 1 : -1;
    return sym2key[`${parseInt(s[0], 10)},${x}`];
  } else {
    const pitchChar = s[s.length - 1].toUpperCase();
    const pitchDict: Record<string, number> = {
      A: 6,
      B: 7,
      C: 1,
      D: 2,
      E: 3,
      F: 4,
      G: 5,
    };
    if (!(pitchChar in pitchDict)) {
      throw new Error(`Wrong format for <key> ${s}`);
    }
    const pitch = pitchDict[pitchChar];
    let tmp = 0;
    if (s.length === 2) {
      if (s[0] === '#') tmp = 1;
      else if (s[0] === '$') tmp = -1;
      else throw new Error(`Wrong format for <key> ${s}`);
    }
    return [pitch, tmp];
  }
}

export function parseTime(s: string): ParsedTime {
  const parts = s.trim().split(/\s+/);
  let hyphen: number | undefined = undefined;

  if (parts.length > 1) {
    let hStr = parts[1].replace(/\s+/g, '');
    if (!hStr.startsWith('hyphen=')) {
      throw new Error(`Wrong format for <time> ${s}`);
    }
    hStr = hStr.slice(7);
    if (!['4', '8', '16'].includes(hStr)) {
      throw new Error('Only hyphen=[4,8,16] is allowed');
    }
    hyphen = parseInt(hStr, 10);
  }

  const timeParts = parts[0].replace(/\s+/g, '').split('/');
  if (timeParts.length !== 2) {
    throw new Error(`Wrong format for <time> ${s}`);
  }

  const upper = timeParts[0] === '?' ? 0 : parseInt(timeParts[0], 10);
  const lower = parseInt(timeParts[1], 10);

  const allowed: [number, number][] = [
    [2, 4],
    [3, 4],
    [4, 4],
    [6, 8],
    [9, 8],
    [12, 8],
    [0, 4],
    [0, 8],
  ];
  if (!allowed.some(([u, l]) => u === upper && l === lower)) {
    throw new Error(`Unrecognizable <time> ${upper}/${lower}`);
  }
  if (hyphen !== undefined && hyphen < lower) {
    throw new Error(`Hyphen must >= ${lower} for <time> ${upper}/${lower}`);
  }

  return { upper, lower, hyphen };
}

export function parsePitch(
  key: KeySignature,
  s: string
): [Accidental | null, number, number] {
  const keyDict: Record<string, number> = {
    A: 6,
    B: 7,
    C: 1,
    D: 2,
    E: 3,
    F: 4,
    G: 5,
  };
  const extendedUpperNameDict: Record<string, number> = {
    q: 1,
    w: 2,
    e: 3,
    r: 4,
    t: 5,
    y: 6,
    u: 7,
    '8': 1,
    '9': 2,
  };
  const extendedLowerNameDict: Record<string, number> = {
    z: 1,
    x: 2,
    c: 3,
    v: 4,
    b: 5,
    n: 6,
    m: 7,
  };
  const accDict: Record<string, Accidental | null> = {
    '': null,
    '#': Accidental.Sharp,
    $: Accidental.Flat,
    '%': Accidental.Natural,
  };

  const match = s.match(/^([#$%]?)([0-9a-zA-Z])([',]*)$/);
  if (!match) {
    throw new Error(`Wrong format for pitch ${s}`);
  }

  let acc: Accidental | null = accDict[match[1]];
  let nameStr = match[2];
  const octaveStr = match[3];
  let octave = (octaveStr.match(/'/g) || []).length - (octaveStr.match(/,/g) || []).length;

  if (nameStr === '0') {
    return [null, Note.REST, 0];
  } else if (nameStr === 'o') {
    return [null, Note.REST_AT_END, 0];
  } else if (nameStr === 'O') {
    return [null, Note.REST_TO_MATCH_LYRICS, 0];
  }

  let name = 0;
  if (key === 'solfa') {
    if ('1234567'.includes(nameStr)) {
      name = parseInt(nameStr, 10);
    } else if (nameStr in extendedUpperNameDict) {
      name = extendedUpperNameDict[nameStr];
      octave += 1;
    } else if (nameStr in extendedLowerNameDict) {
      name = extendedLowerNameDict[nameStr];
      octave -= 1;
    } else {
      throw new Error(`'${s}' is not allowed in <key> solfa`);
    }
  } else {
    if ('1234567'.includes(nameStr)) {
      name = parseInt(nameStr, 10);
    } else if ('cdefgabCDEFGAB'.includes(nameStr)) {
      name = keyDict[nameStr.toUpperCase()];
    } else if (nameStr in extendedUpperNameDict) {
      name = extendedUpperNameDict[nameStr];
      octave += 1;
    } else {
      throw new Error(`'${nameStr}' is not allowed in key ${key}`);
    }

    const scale = getKeyScale(key);
    if (acc !== null) {
      acc = acc - scale[name];
    }
    if (key[0] <= 4) {
      if (name < key[0]) octave -= 1;
    } else {
      if (name >= key[0]) octave += 1;
    }
    name = ((((name - key[0]) % 7) + 7) % 7) + 1;
  }

  return [acc, name, octave];
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
      if (note._name === Note.REST_TO_MATCH_LYRICS) {
        subnote._name = Note.REST;
      }
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

export class ClassicSongParser {
  key: KeySignature = [1, 0]; // Default C major
  melody: Array<[ParsedTime, Fraction, Note[]]> = [];
  lyrics: Array<[string, string[]]> = [];
  slurStartsAtLeadingNote = true;
  group8thNotes = false;

  appendTimeSignature(time: ParsedTime, s: string) {
    if (!time) throw new Error('Unknown <time>');
    if (!s) return;

    const patternPitch = "[#$%]?[0-9a-zA-Z][',]*";
    const patternPitches = `\\[(?:${patternPitch})+\\]`;
    const patternDuration = '(?:[_=]+|-*)\\.*(?:/3)?';
    const regex = new RegExp(`(~?)(${patternPitch}|${patternPitches})(${patternDuration})(~?)`, 'g');

    const bars = s.split('|');
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!bar) continue;

      let barDuration = new Fraction(0);
      const noteList: Note[] = [];

      let match: RegExpExecArray | null;
      let matchedLen = 0;
      regex.lastIndex = 0;

      while ((match = regex.exec(bar)) !== null) {
        matchedLen += match[0].length;
        const tie0 = match[1] !== '';
        let pitchesStr = match[2];
        const durationStr = match[3];
        const tie1 = match[4] !== '';

        const dots = (durationStr.match(/\./g) || []).length;
        const dashes = (durationStr.match(/-/g) || []).length;
        const underlines =
          (durationStr.match(/=/g) || []).length * 2 +
          (durationStr.match(/_/g) || []).length;

        if (dashes > 0 && underlines > 0) {
          throw new Error(`Wrong format for bar notes ${bar}`);
        }

        let triplet = new Fraction(1);
        if (durationStr.includes('/3')) {
          triplet = new Fraction(2, 3);
        }

        let duration: Fraction;
        let dashesFinal: number | null = dashes;
        let underlinesFinal: number = underlines;
        let dotsFinal: number | null = dots;

        if (time.hyphen) {
          if (pitchesStr.startsWith('[') && pitchesStr.endsWith(']')) {
            duration = new Fraction(dashes + 1, 1 << underlines)
              .mul(new Fraction(2).sub(new Fraction(1, 1 << dots)))
              .mul(triplet);
          } else {
            if (dots > 0 || underlines > 0 || !triplet.equals(1)) {
              throw new Error('Dots, underlines and triplets are not allowed without brackets in hyphenated time');
            }
            duration = new Fraction(dashes + 1, Math.floor(time.hyphen / 4));
            dashesFinal = null;
            underlinesFinal = 0;
            dotsFinal = null;
          }
        } else {
          duration = new Fraction(dashes + 1, 1 << underlines)
            .mul(new Fraction(2).sub(new Fraction(1, 1 << dots)))
            .mul(triplet);
        }

        pitchesStr = pitchesStr.replace(/^\[|\]$/g, '');
        const pitchMatches = pitchesStr.match(new RegExp(patternPitch, 'g')) || [];

        for (let k = 0; k < pitchMatches.length; k++) {
          const pitch = pitchMatches[k];
          const [acc, name, octave] = parsePitch(this.key, pitch);
          const tie: [boolean, boolean] = [tie0, tie1];
          if (k > 0) tie[0] = false;
          if (k < pitchMatches.length - 1) tie[1] = false;

          const note = new Note(
            acc,
            name,
            octave,
            duration,
            dashesFinal,
            underlinesFinal,
            dotsFinal ?? 0,
            tie
          );
          noteList.push(note);
          barDuration = barDuration.add(duration);
        }
      }

      if (matchedLen !== bar.length) {
        throw new Error(`Wrong format for bar '${bar}'`);
      }
      if (noteList.length === 0) continue;

      let timeDuration: Fraction;
      if (time.upper === 0) {
        timeDuration = barDuration;
      } else if (time.lower === 4) {
        timeDuration = new Fraction(time.upper);
      } else {
        timeDuration = new Fraction(time.upper, 2);
      }

      let beat = new Fraction(0);
      if (i === 0 && bars.length > 1) {
        // Pickup bar
        const mod = barDuration.toNumber() % timeDuration.toNumber();
        beat = new Fraction(timeDuration.toNumber() - mod).sub(new Fraction(0));
        if (beat.equals(timeDuration)) beat = new Fraction(0);
      }

      if (beat.greaterThan(0)) {
        this.melody.push([time, beat, []]);
      }

      for (const note of noteList) {
        let remainingDuration = note.duration;
        let first = true;

        while (remainingDuration.greaterThan(0)) {
          if (beat.equals(0)) {
            this.melody.push([time, beat, []]);
          }

          const timeCap = timeDuration.sub(beat);
          const subDuration = remainingDuration.lessThan(timeCap) ? remainingDuration : timeCap;

          if (!time.hyphen && !subDuration.equals(remainingDuration)) {
            throw new Error(`Note ${note} goes beyond one bar in time ${time.upper}/${time.lower}`);
          }

          const subNote = note.copy();
          subNote.duration = subDuration;
          if (!first) {
            subNote.tie[0] = true;
          }
          this.melody[this.melody.length - 1][2].push(subNote);
          remainingDuration = remainingDuration.sub(subDuration);
          beat = beat.add(subDuration);

          if (beat.equals(timeDuration)) {
            beat = new Fraction(0);
          }
          first = false;
        }
      }
    }
  }

  trySplitNotes() {
    for (let b = 0; b < this.melody.length; b++) {
      const [time, startBeat, notes] = this.melody[b];
      if (!time.hyphen) continue;

      const subnotes: Note[] = [];
      let beat = startBeat;

      for (const note of notes) {
        if (note.lines === null || note.dots === null) {
          const split = splitNote(time, beat, note);
          subnotes.push(...split);
        } else {
          subnotes.push(note);
        }
        beat = beat.add(note.duration);
      }
      this.melody[b][2] = subnotes;
    }
  }

  makeTiesConsistent() {
    if (this.melody.length === 0) return;
    let prevTie = false;
    for (const [, , notes] of this.melody) {
      if (notes.length === 0) throw new Error('Empty bar in melody');
      for (const note of notes) {
        if (prevTie) {
          note.tie[0] = true;
        }
        if (note.isRest) {
          note.tie = [false, false];
        }
        prevTie = note.tie[1];
      }
    }
    this.melody[0][2][0].tie[0] = false;
    const lastBar = this.melody[this.melody.length - 1][2];
    lastBar[lastBar.length - 1].tie[1] = false;
  }

  mergeMelodyLyrics(): Section[] {
    let sumLen = 0;
    const splitSections: Record<number, string> = {};
    const splitLines: Set<number> = new Set();

    for (const [tag, lyricsList] of this.lyrics) {
      splitSections[sumLen] = tag;
      for (const s of lyricsList) {
        if (s.startsWith('~')) {
          throw new Error(`A line of lyrics cannot start with '~' (${s})`);
        }
        splitLines.add(sumLen);
        sumLen += s.length;
      }
    }

    const allLyrics = this.lyrics.flatMap(([, lines]) => lines).join('');
    const numWords = allLyrics.length;

    let lyricsIdx = 0;
    let sectionAdded = false;
    let lineAdded = false;
    let lineNodeIdxPrev = -1;
    let potentialSlurStartLineNodeIdx: number | null = null;
    const sections: Section[] = [];

    for (const [time, startBeat, notes] of this.melody) {
      let beat = startBeat;
      for (let k = 0; k < notes.length; k++) {
        const note = notes[k];

        // New section
        const tag = splitSections[lyricsIdx];
        if (tag && !sectionAdded) {
          if (note.mayStartNewLine) {
            sections.push({ tag, lines: [] });
            sectionAdded = true;
          }
        }

        // New line
        if (splitLines.has(lyricsIdx) && !lineAdded) {
          if (note.mayStartNewLine) {
            sections[sections.length - 1].lines.push(new OutputLine());
            lineAdded = true;
            lineNodeIdxPrev = -1;
            potentialSlurStartLineNodeIdx = null;
          }
        }

        const curSection = sections[sections.length - 1];
        const line = curSection.lines[curSection.lines.length - 1];
        const nodes = line.nodes;
        const bars = line.bars;
        const ties = line.ties;
        const slurs = line.slurs;
        const lineNodeIdx = nodes.length;

        // New bar
        if (k === 0 || bars.length === 0) {
          bars.push({ time, beat, nodeIndex: lineNodeIdx });
        }

        // Handle slurs
        if (note.isRest) {
          potentialSlurStartLineNodeIdx = null;
        } else {
          if (note.toMatchLyrics && allLyrics[lyricsIdx] === '~') {
            if (lyricsIdx === numWords - 1 || allLyrics[lyricsIdx + 1] !== '~') {
              if (potentialSlurStartLineNodeIdx === null) {
                throw new Error('Start note of slur not found');
              }
              slurs.push({
                start: potentialSlurStartLineNodeIdx,
                end: lineNodeIdx,
              });
              potentialSlurStartLineNodeIdx = null;
            }
          }

          const curLyricsIdx = note.toMatchLyrics ? lyricsIdx : lyricsIdx - 1;
          if (curLyricsIdx >= 0 && curLyricsIdx < numWords && allLyrics[curLyricsIdx] !== '~') {
            if (this.slurStartsAtLeadingNote) {
              if (note.isFirstInTie) potentialSlurStartLineNodeIdx = lineNodeIdx;
            } else {
              if (note.isLastInTie) potentialSlurStartLineNodeIdx = lineNodeIdx;
            }
          }
        }

        const node = new NodeElement(note);
        if (note.tie[0]) {
          ties.push({ start: lineNodeIdxPrev, end: lineNodeIdx });
          (node.value as Note).tie[0] = true;
          (nodes[lineNodeIdxPrev].value as Note).tie[1] = true;
        } else {
          if (note.toMatchLyrics) {
            if (lyricsIdx >= numWords) {
              throw new Error(`#notes > ${numWords} words`);
            }
            const lyricChar = allLyrics[lyricsIdx];
            if (note.isRest) {
              if (lyricChar !== 'O') {
                throw new Error(`Note O cannot match lyrics "${lyricChar}"`);
              }
            } else if (lyricChar !== '~') {
              node.text = lyricChar;
            }
            lyricsIdx++;
            sectionAdded = false;
            lineAdded = false;
          }
        }

        nodes.push(node);
        lineNodeIdxPrev = lineNodeIdx;

        // Append dash nodes
        for (let d = 0; d < (node.lines ?? 0); d++) {
          nodes.push(new NodeElement('-'));
        }
        // Append dot nodes
        for (let dt = 0; dt < (node.dots ?? 0); dt++) {
          nodes.push(new NodeElement('.'));
        }

        beat = beat.add(note.duration);
      }
    }

    if (lyricsIdx !== numWords) {
      throw new Error(`${lyricsIdx} notes != ${numWords} words`);
    }

    return sections;
  }

  private get8thNoteGroups(
    nodes: NodeElement[],
    time: ParsedTime,
    startBeat: Fraction,
    idxList: number[]
  ): [number, number][] {
    if (time.lower !== 4 || time.upper % 2 !== 0) {
      return [];
    }

    const parts: Array<Array<{ idx: number; duration: Fraction }>> = [];
    let beat = startBeat;
    for (const idx of idxList) {
      const node = nodes[idx];
      if (node.type !== NodeType.NOTE) continue;
      const note = node.value as Note;
      if (parts.length === 0 || beat.toNumber() % 2 === 0) {
        parts.push([]);
      }
      parts[parts.length - 1].push({ idx, duration: note.duration });
      beat = beat.add(note.duration);
    }

    const groups: [number, number][] = [];
    for (const part of parts) {
      if (part.every((p) => p.duration.equals(new Fraction(1, 2))) && part.length > 2) {
        groups.push([part[0].idx, part[part.length - 1].idx]);
      }
    }
    return groups;
  }

  groupUnderlines(line: OutputLine) {
    const underlinesList: NodeRange[][] = [[]]; // depth 0 unused
    const rawTriplets: number[][] = [];
    let tripletDuration: Fraction | null = null;

    for (let bIdx = 0; bIdx < line.bars.length; bIdx++) {
      const bar = line.bars[bIdx];
      let beat = bar.beat;
      let idxPrev: number | null = null;

      const barStartIndex = bar.nodeIndex;
      const nextBar = line.bars[bIdx + 1];
      const barEndIndex = nextBar ? nextBar.nodeIndex : line.nodes.length;
      const idxList: number[] = [];
      for (let i = barStartIndex; i < barEndIndex; i++) idxList.push(i);

      let specialGroups: [number, number][] = [];
      let groupIdx = 0;
      if (this.group8thNotes) {
        specialGroups = this.get8thNoteGroups(line.nodes, bar.time as ParsedTime, bar.beat, idxList);
      }

      for (const idx of idxList) {
        const node = line.nodes[idx];
        if (node.type !== NodeType.NOTE) continue;
        const note = node.value as Note;

        if (groupIdx < specialGroups.length && idx > specialGroups[groupIdx][1]) {
          groupIdx++;
        }
        const specialGroup = groupIdx < specialGroups.length ? specialGroups[groupIdx] : null;

        let newGroup = false;
        if (
          (bar.time.lower === 4 && beat.toNumber() % 1 === 0) ||
          (bar.time.lower === 8 && beat.toNumber() % 1.5 === 0)
        ) {
          newGroup = true;
        }

        // Triplet handling
        if (newGroup) {
          tripletDuration = null;
        }
        if (note.duration.den % 3 === 0) {
          if (newGroup || rawTriplets.length === 0 || !note.duration.equals(tripletDuration ?? 0)) {
            if (rawTriplets.length > 0 && rawTriplets[rawTriplets.length - 1].length !== 3) {
              throw new Error('triplet with less than 3 notes');
            }
            rawTriplets.push([idx]);
          } else if (rawTriplets[rawTriplets.length - 1].length === 3) {
            rawTriplets.push([idx]);
          } else {
            rawTriplets[rawTriplets.length - 1].push(idx);
          }
          tripletDuration = note.duration;
        }

        // Underline handling
        let newUnderlineGroup = newGroup;
        if (specialGroup && specialGroup[0] < idx && idx <= specialGroup[1]) {
          newUnderlineGroup = false;
        }

        if (node.lines !== null && node.lines < 0) {
          const depth = -node.lines;
          while (underlinesList.length <= depth) {
            underlinesList.push([]);
          }
          for (let k = 1; k <= depth; k++) {
            if (newUnderlineGroup || underlinesList[k].length === 0) {
              underlinesList[k].push({ start: idx, end: idx });
            } else if (underlinesList[k][underlinesList[k].length - 1].end === idxPrev) {
              underlinesList[k][underlinesList[k].length - 1].end = idx;
            } else {
              underlinesList[k].push({ start: idx, end: idx });
            }
          }
        }

        beat = beat.add(note.duration);
        idxPrev = idx;
      }
    }

    line.underlinesList = underlinesList;
    line.triplets = rawTriplets.map((t) => ({ start: t[0], middle: t[1], end: t[2] }));
  }
}

export function parseClassicSong(melodyText: string, lyricsText: string): SongAST {
  const parser = new ClassicSongParser();

  let time: ParsedTime | null = null;
  let s = '';

  // Parse melody
  const melodyLines = melodyText.split(/\r?\n/);
  for (let line of melodyLines) {
    line = line.trim();
    if (line === 'break') break;
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('<key>')) {
      if (parser.key && parser.melody.length > 0) {
        throw new Error('Only one <key> is allowed');
      }
      parser.key = parseKey(line.slice(5).trim());
    } else if (line.startsWith('<time>')) {
      if (time) {
        parser.appendTimeSignature(time, s);
      }
      time = parseTime(line.slice(6).trim());
      s = '';
    } else if (line.startsWith('<slur_starts_at_leading_note>')) {
      parser.slurStartsAtLeadingNote = Boolean(parseInt(line.slice(29).trim(), 10));
    } else if (line.startsWith('<group_8th_notes>')) {
      parser.group8thNotes = Boolean(parseInt(line.slice(17).trim(), 10));
    } else {
      s += line.replace(/\s+/g, '');
    }
  }
  if (time) {
    parser.appendTimeSignature(time, s);
  }
  parser.trySplitNotes();
  parser.makeTiesConsistent();

  // Parse lyrics
  const lyricsLines = lyricsText.split(/\r?\n/);
  for (let line of lyricsLines) {
    line = line.trim();
    let cleaned = line;
    for (const c of ' ,.!?　。，、！？') {
      cleaned = cleaned.replaceAll(c, '');
    }
    if (cleaned === 'break') break;
    if (!cleaned || cleaned.startsWith('//')) continue;

    if (cleaned.startsWith('<tag>')) {
      const tag = cleaned.slice(5).trim();
      parser.lyrics.push([tag, []]);
    } else {
      if (parser.lyrics.length === 0) {
        throw new Error(`No <tag> specified before ${line}`);
      }
      parser.lyrics[parser.lyrics.length - 1][1].push(cleaned);
    }
  }

  const sections = parser.mergeMelodyLyrics();
  for (const section of sections) {
    for (const line of section.lines) {
      parser.groupUnderlines(line);
    }
  }

  const keyDisplay = typeof parser.key === 'string' ? parser.key : `1=${['C', 'D', 'E', 'F', 'G', 'A', 'B'][parser.key[0] - 1]}`;
  const firstTime = parser.melody[0]?.[0] || { upper: 4, lower: 4 };

  return {
    key: keyDisplay,
    time: firstTime,
    sections,
  };
}
