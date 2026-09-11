import { describe, expect, it } from 'vitest';
import { parseClassicSong } from '../src/core/parserClassic';
import {
  isValidPitchString,
  normalizePitchString,
  formatPitchFromNote,
  performSynchronizedFlowToNext,
  performSynchronizedFlowToPrev,
  performSynchronizedLineBreak,
  performSynchronizedLineMerge,
  spliceLyricChar,
  spliceLyricLineBreak,
  spliceMelodyPitch,
  spliceMelodyTrailingRest,
  spliceRemoveLyricLineBreak,
} from '../src/core/sourceSplicer';
import { Note } from '../src/core/types';

describe('SourceSpan tracking in parserClassic', () => {
  it('attaches exact source spans to melody notes and lyrics', () => {
    const melodyText = `<key> C
<time> 4/4
| 5 5 5 5 | 3. 5_ 5 6 | 5 - - 0 |`;

    const lyricsText = `<tag> 主歌
主啊我神，我每逢举目`;

    const ast = parseClassicSong(melodyText, lyricsText);
    expect(ast.sections.length).toBe(1);
    const line = ast.sections[0].lines[0];
    expect(line.nodes.length).toBeGreaterThan(0);

    // Find the first node with text
    const firstLyricNode = line.nodes.find((n) => n.text === '主');
    expect(firstLyricNode).toBeDefined();
    expect(firstLyricNode?.lyricSpan).toBeDefined();

    // Verify lyricSpan matches "主" in lyricsText
    const lyricSlice = lyricsText.slice(
      firstLyricNode!.lyricSpan!.start,
      firstLyricNode!.lyricSpan!.end
    );
    expect(lyricSlice).toBe('主');

    // Verify melodySpan matches the note pitch in melodyText
    expect(firstLyricNode?.melodySpan).toBeDefined();
    const melodySlice = melodyText.slice(
      firstLyricNode!.melodySpan!.start,
      firstLyricNode!.melodySpan!.end
    );
    expect(melodySlice).toBe('5');
  });

  it('correctly tracks source spans with hyphen=16 and comments', () => {
    const melodyText = `// Worship Intro
<key> F
<time> 4/4 hyphen=16
// Verse
| 1-- 2-- 3--- | 5---- |`;

    const lyricsText = `<tag> 主歌
主 啊 我 神`;

    const ast = parseClassicSong(melodyText, lyricsText);
    const line = ast.sections[0].lines[0];
    const nodeZhu = line.nodes.find((n) => n.text === '主');
    expect(nodeZhu).toBeDefined();
    expect(nodeZhu?.melodySpan).toBeDefined();

    const noteSlice = melodyText.slice(
      nodeZhu!.melodySpan!.start,
      nodeZhu!.melodySpan!.end
    );
    expect(noteSlice).toBe('1');
  });
});

describe('Surgical Splicer minimal modifications', () => {
  it('splices a lyric line break while preserving punctuation', () => {
    const lyricsText = `<tag> 主歌
主啊我神，我每逢举目观望`;

    // "神" is followed by comma "，"
    const shenStart = lyricsText.indexOf('神');
    const shenSpan = { start: shenStart, end: shenStart + 1 };

    const brokenLyrics = spliceLyricLineBreak(lyricsText, shenSpan);
    expect(brokenLyrics).toBe(`<tag> 主歌
主啊我神，
我每逢举目观望`);
  });

  it('splices removing a lyric line break', () => {
    const lyricsText = `<tag> 主歌
主啊我神，
我每逢举目观望`;

    const shenStart = lyricsText.indexOf('神');
    const shenSpan = { start: shenStart, end: shenStart + 1 };

    const merged = spliceRemoveLyricLineBreak(lyricsText, shenSpan);
    expect(merged).toBe(`<tag> 主歌
主啊我神，我每逢举目观望`);
  });

  it('in-place replaces a lyric character without touching surroundings', () => {
    const lyricsText = `<tag> 主歌
主啊我神，我每逢举目观望`;

    // Target the "主" in the lyrics, not in the tag
    const zhuStart = lyricsText.indexOf('主啊');
    const zhuSpan = { start: zhuStart, end: zhuStart + 1 };

    const replaced = spliceLyricChar(lyricsText, zhuSpan, '天');
    expect(replaced).toBe(`<tag> 主歌
天啊我神，我每逢举目观望`);
  });

  it('toggles trailing rest 0 to o in melodyText without touching hyphen=16 or comments', () => {
    const melodyText = `// Special config
<time> 4/4 hyphen=16
| 1-- 2-- 3-- 0 |
| 5---- |`;

    const zeroIndex = melodyText.indexOf('0');
    const zeroSpan = { start: zeroIndex, end: zeroIndex + 1 };

    const toggled = spliceMelodyTrailingRest(melodyText, zeroSpan, true);
    expect(toggled).toContain('| 1-- 2-- 3-- o |');
    expect(toggled).toContain('// Special config');
    expect(toggled).toContain('<time> 4/4 hyphen=16');

    // Toggle back
    const oIndex = toggled.indexOf('o |');
    const oSpan = { start: oIndex, end: oIndex + 1 };
    const toggledBack = spliceMelodyTrailingRest(toggled, oSpan, false);
    expect(toggledBack).toBe(melodyText);
  });

  it('in-place replaces melody pitch token without disturbing surrounding syntax', () => {
    const melodyText = `<time> 4/4
| [555]_ 3. 5 |`;

    const first5Index = melodyText.indexOf('5');
    const pitchSpan = { start: first5Index, end: first5Index + 1 };

    const replaced = spliceMelodyPitch(melodyText, pitchSpan, '6');
    expect(replaced).toBe(`<time> 4/4
| [655]_ 3. 5 |`);
  });

  it('performs synchronized line break between lyrics and trailing rest in melody', () => {
    const melodyText = `<time> 4/4
| 5 5 5 5 | 5 - - 0 | 4 4 3 3 |`;

    const lyricsText = `<tag> 主歌
主啊我神你 手创造物`;

    const ast = parseClassicSong(melodyText, lyricsText);
    const line = ast.sections[0].lines[0];

    const shouNode = line.nodes.find((n) => n.text === '手')!;
    const restNode = line.nodes.find((n) => n.value instanceof Note && n.value.isRest)!;

    const result = performSynchronizedLineBreak(
      lyricsText,
      melodyText,
      shouNode,
      restNode
    );

    expect(result.lyricsText).toBe(`<tag> 主歌
主啊我神你
手创造物`);
    expect(result.melodyText).toContain('| 5 - - o |');
  });

  it('aligns left and renders slides when 5 notes with 4 words', () => {
    const melody = `<time> 4/4\n| 5 5 5 3 2 |`;
    const lyrics = `<tag> 主歌\n主阿我神`;
    const ast = parseClassicSong(melody, lyrics);

    expect(ast.errors).toContain('5 notes != 4 words');
    expect(ast.sections).toHaveLength(1);
    const line = ast.sections[0].lines[0];
    const notes = line.nodes.filter((n) => n.value instanceof Note);
    expect(notes).toHaveLength(5);
    expect(notes.map((n) => n.text)).toEqual(['主', '阿', '我', '神', null]);
  });

  it('aligns left and renders slides when 4 notes with 5 words', () => {
    const melody = `<time> 4/4\n| 5 5 5 3 |`;
    const lyrics = `<tag> 主歌\n主阿我神恩`;
    const ast = parseClassicSong(melody, lyrics);

    expect(ast.errors).toContain('4 notes != 5 words');
    expect(ast.sections).toHaveLength(1);
    const line = ast.sections[0].lines[0];
    const notes = line.nodes.filter((n) => n.value instanceof Note);
    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.text)).toEqual(['主', '阿', '我', '神']);
  });

  it('performs roundtrip line break and re-parse on full song', () => {
    let melody = `<key> C\n<time> 4/4\n| 5 5 5 5 | 3. 5_ 5 6 | 5 - - 0 |\n| 4 4 3 3 | 2 2 1 - |`;
    let lyrics = `<tag> 主歌\n主啊我神每逢举目\n观看你手所造世界`;

    // 1. Initial parse
    const initialAst = parseClassicSong(melody, lyrics);
    expect(initialAst.sections[0].lines.length).toBe(2);

    // 2. User clicks line break before "每" (in first line)
    const line0 = initialAst.sections[0].lines[0];
    const meiNode = line0.nodes.find((n) => n.text === '每')!;
    expect(meiNode).toBeDefined();

    const breakResult = performSynchronizedLineBreak(lyrics, melody, meiNode, null);
    lyrics = breakResult.lyricsText;
    melody = breakResult.melodyText;

    // 3. Re-parse with updated texts
    const newAst = parseClassicSong(melody, lyrics);
    expect(newAst.sections[0].lines.length).toBe(3);
    expect(newAst.sections[0].lines[0].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '主',
      '啊',
      '我',
      '神',
    ]);
    expect(newAst.sections[0].lines[1].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '每',
      '逢',
      '举',
      '目',
    ]);
  });

  it('performs roundtrip lyric character edit on parsed AST', () => {
    let melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    let lyrics = `<tag> 主歌\n主啊我神`;

    const ast = parseClassicSong(melody, lyrics);
    const targetNode = ast.sections[0].lines[0].nodes.find((n) => n.text === '主')!;
    expect(targetNode.lyricSpan).toBeDefined();

    lyrics = spliceLyricChar(lyrics, targetNode.lyricSpan!, '天');
    expect(lyrics).toBe(`<tag> 主歌\n天啊我神`);

    const reAst = parseClassicSong(melody, lyrics);
    expect(reAst.sections[0].lines[0].nodes[0].text).toBe('天');
  });

  it('performs roundtrip melody pitch edit on parsed AST', () => {
    let melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    let lyrics = `<tag> 主歌\n主啊我神`;

    const ast = parseClassicSong(melody, lyrics);
    const targetNode = ast.sections[0].lines[0].nodes[0]; // note 1
    expect(targetNode.melodySpan).toBeDefined();

    melody = spliceMelodyPitch(melody, targetNode.melodySpan!, '5');
    expect(melody).toBe(`<key> C\n<time> 4/4\n| 5 2 3 4 |`);

    const reAst = parseClassicSong(melody, lyrics);
    const firstNote = reAst.sections[0].lines[0].nodes[0].value as Note;
    expect(firstNote.name).toBe(5);
  });

  it('validates melody pitch strings and blocks invalid tokens like "p"', () => {
    // Valid standard pitches
    expect(isValidPitchString('1')).toBe(true);
    expect(isValidPitchString('5')).toBe(true);
    expect(isValidPitchString('7')).toBe(true);
    expect(isValidPitchString('0')).toBe(true);
    expect(isValidPitchString('#4')).toBe(true);
    expect(isValidPitchString('$7')).toBe(true);
    expect(isValidPitchString("5'")).toBe(true);
    expect(isValidPitchString('5,')).toBe(true);
    expect(isValidPitchString('q')).toBe(true);

    // Invalid pitches
    expect(isValidPitchString('p')).toBe(false);
    expect(isValidPitchString('k')).toBe(false);
    expect(isValidPitchString('abc')).toBe(false);
    expect(isValidPitchString('')).toBe(false);
    expect(isValidPitchString('   ')).toBe(false);

    // spliceMelodyPitch must block invalid pitch 'p' and leave melody unchanged
    const melody = `<key> C\n<time> 4/4\n| 5 5 5 5 |`;
    const span = { start: melody.indexOf('5'), end: melody.indexOf('5') + 1 };
    const rejected = spliceMelodyPitch(melody, span, 'p');
    expect(rejected).toBe(melody);
  });

  it('correctly modifies pitch of notes with high/low octave dots (e.g. 6\')', () => {
    let melody = `<key> C\n<time> 4/4\n| 6' - - - |`;
    let lyrics = `<tag> 主歌\n主`;

    const ast = parseClassicSong(melody, lyrics);
    const targetNode = ast.sections[0].lines[0].nodes[0];
    expect(targetNode.melodySpan).toBeDefined();

    // Verify formatPitchFromNote formats high octave dot
    const curNote = targetNode.value as Note;
    expect(formatPitchFromNote(curNote)).toBe("6'");
    expect(curNote.toPitchString()).toBe("6'");

    // Modify pitch to 5'
    melody = spliceMelodyPitch(melody, targetNode.melodySpan!, "5'");
    expect(melody).toBe(`<key> C\n<time> 4/4\n| 5' - - - |`);

    // Modify pitch from 5' to standard 6 (dropping octave dot)
    const reAst = parseClassicSong(melody, lyrics);
    const node5p = reAst.sections[0].lines[0].nodes[0];
    melody = spliceMelodyPitch(melody, node5p.melodySpan!, '6');
    expect(melody).toBe(`<key> C\n<time> 4/4\n| 6 - - - |`);
  });

  it('normalizes unicode curly quotes and commas into standard pitch syntax', () => {
    expect(normalizePitchString("6’")).toBe("6'");
    expect(normalizePitchString("6′")).toBe("6'");
    expect(normalizePitchString("6‘")).toBe("6'");
    expect(normalizePitchString("6＇")).toBe("6'");
    expect(normalizePitchString("5，")).toBe('5,');
    expect(normalizePitchString("5、")).toBe('5,');

    expect(isValidPitchString("6’")).toBe(true);
    expect(isValidPitchString("6′")).toBe(true);
    expect(isValidPitchString("5，")).toBe(true);

    const melody = `<key> C\n<time> 4/4\n| 6 - - - |`;
    const span = { start: melody.indexOf('6'), end: melody.indexOf('6') + 1 };
    const spliced = spliceMelodyPitch(melody, span, "6’");
    expect(spliced).toBe(`<key> C\n<time> 4/4\n| 6' - - - |`);
  });

  it('performs synchronized line merge between two lines', () => {
    let melody = `<key> C\n<time> 4/4\n| 5 5 5 5 | 3 3 2 1 |`;
    let lyrics = `<tag> 主歌\n主啊我神\n每逢举目`;

    const ast = parseClassicSong(melody, lyrics);
    expect(ast.sections[0].lines).toHaveLength(2);

    const line0 = ast.sections[0].lines[0];
    const shenNode = line0.nodes.find((n) => n.text === '神')!;
    expect(shenNode).toBeDefined();

    const merged = performSynchronizedLineMerge(lyrics, melody, shenNode);
    expect(merged.lyricsText).toBe(`<tag> 主歌\n主啊我神每逢举目`);

    const reAst = parseClassicSong(merged.melodyText, merged.lyricsText);
    expect(reAst.sections[0].lines).toHaveLength(1);
    expect(reAst.sections[0].lines[0].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '主',
      '啊',
      '我',
      '神',
      '每',
      '逢',
      '举',
      '目',
    ]);
  });

  it('flows trailing units to next line (performSynchronizedFlowToNext)', () => {
    let melody = `<key> C\n<time> 4/4\n| 1 2 3 4 | 5 6 7 1' |`;
    let lyrics = `<tag> 主歌\n主啊我神\n观看你手`;

    const ast = parseClassicSong(melody, lyrics);
    expect(ast.sections[0].lines).toHaveLength(2);

    const line0 = ast.sections[0].lines[0];
    const aNode = line0.nodes.find((n) => n.text === '啊')!;
    const shenNode = line0.nodes.find((n) => n.text === '神')!;

    // Move trailing units starting after '啊' (i.e. '神') into next line
    const result = performSynchronizedFlowToNext(lyrics, melody, aNode, shenNode);
    expect(result.lyricsText).toBe(`<tag> 主歌\n主啊\n我神观看你手`);

    const reAst = parseClassicSong(result.melodyText, result.lyricsText);
    expect(reAst.sections[0].lines).toHaveLength(2);
    expect(reAst.sections[0].lines[0].nodes.map((n) => n.text).filter(Boolean)).toEqual(['主', '啊']);
    expect(reAst.sections[0].lines[1].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '我',
      '神',
      '观',
      '看',
      '你',
      '手',
    ]);
  });

  it('flows leading units to previous line (performSynchronizedFlowToPrev)', () => {
    let melody = `<key> C\n<time> 4/4\n| 1 2 3 4 | 5 6 7 1' |`;
    let lyrics = `<tag> 主歌\n主啊\n我神观看你手`;

    const ast = parseClassicSong(melody, lyrics);
    expect(ast.sections[0].lines).toHaveLength(2);

    const line0 = ast.sections[0].lines[0];
    const line1 = ast.sections[0].lines[1];
    const aNode = line0.nodes.find((n) => n.text === '啊')!;
    const shenNode = line1.nodes.find((n) => n.text === '神')!;

    // Move leading units up to '神' into previous line
    const result = performSynchronizedFlowToPrev(lyrics, melody, shenNode, aNode);
    expect(result.lyricsText).toBe(`<tag> 主歌\n主啊我神\n观看你手`);

    const reAst = parseClassicSong(result.melodyText, result.lyricsText);
    expect(reAst.sections[0].lines).toHaveLength(2);
    expect(reAst.sections[0].lines[0].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '主',
      '啊',
      '我',
      '神',
    ]);
    expect(reAst.sections[0].lines[1].nodes.map((n) => n.text).filter(Boolean)).toEqual([
      '观',
      '看',
      '你',
      '手',
    ]);
  });
});

describe('Full Global Re-Barring Engine (rebarMelodyWithDurationEdit)', () => {
  it('formats single note tokens accurately', async () => {
    const { formatSingleNoteToken } = await import('../src/core/sourceSplicer');
    expect(formatSingleNoteToken('5', 1)).toBe('5');
    expect(formatSingleNoteToken('5', 0.5)).toBe('5_');
    expect(formatSingleNoteToken('5', 0.25)).toBe('5=');
    expect(formatSingleNoteToken('5', 1.5)).toBe('5.');
    expect(formatSingleNoteToken('5', 2)).toBe('5 -');
    expect(formatSingleNoteToken('5', 3)).toBe('5 - -');
    expect(formatSingleNoteToken('5', 4)).toBe('5 - - -');
    expect(formatSingleNoteToken('5', 0.75)).toBe('5_.');
    expect(formatSingleNoteToken('5', 0.375)).toBe('5=.');
  });

  it('preserves upstream 100% byte-for-byte and re-bars downstream when duration increases', async () => {
    const { rebarMelodyWithDurationEdit } = await import('../src/core/sourceSplicer');
    const melody = `// Header Comment\n<key> C\n<time> 4/4\n\n| 1 2 3 4 | 5 6 7 1' |`;
    const lyrics = `<tag> 主歌\n一二三四五六七八`;

    const ast = parseClassicSong(melody, lyrics);
    const node3 = ast.sections[0].lines[0].nodes.find((n) => n.text === '三')!;
    expect(node3).toBeDefined();
    expect(node3.melodySpan).toBeDefined();

    // Change note 3 duration from 1 beat to 2 beats (half note)
    const rebarred = rebarMelodyWithDurationEdit(melody, node3.melodySpan!, 2);

    // Assert upstream before note 3 is completely untouched
    const upstreamSlice = melody.slice(0, node3.melodySpan!.start);
    expect(rebarred.startsWith(upstreamSlice)).toBe(true);
    expect(rebarred).toContain('// Header Comment');
    expect(rebarred).toContain('<key> C');
    expect(rebarred).toContain('<time> 4/4');

    // Bar 1 now has: 1, 2, 3 - (total 1 + 1 + 2 = 4 beats)
    // 4 moves to Bar 2, 1' moves to Bar 3!
    const reAst = parseClassicSong(rebarred, lyrics);
    expect(reAst.errors).toBeUndefined();
    expect(reAst.sections[0].lines[0].bars.length).toBeGreaterThanOrEqual(2);
  });

  it('splits downstream notes across barlines with ties when shifting by fractional beats', async () => {
    const { rebarMelodyWithDurationEdit } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 | 5 6 7 1' |`;
    const lyrics = `<tag> 主歌\n一二三四五六七八`;

    const ast = parseClassicSong(melody, lyrics);
    const node2 = ast.sections[0].lines[0].nodes.find((n) => n.text === '二')!;

    // Change note 2 from 1 beat to 1.5 beats (dotted quarter note)
    const rebarred = rebarMelodyWithDurationEdit(melody, node2.melodySpan!, 1.5);

    // Note 4 now crosses the barline: Bar 1 has 1 (1), 2. (1.5), 3 (1), 4_ ~ (0.5) = 4 beats
    // Bar 2 starts with 4_ (0.5)
    expect(rebarred).toContain('4_ ~');

    // Verify it parses cleanly with zero errors
    const reAst = parseClassicSong(rebarred, lyrics);
    expect(reAst.errors).toBeUndefined();
  });

  it('performs duration and pitch update together in roundtrip on EXAMPLE_SONG_01', async () => {
    const { rebarMelodyWithDurationEdit } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const allNodes = ast.sections[0].lines.flatMap((l) => l.nodes);
    const targetNode = allNodes.find((n) => n.text === '看')!;
    expect(targetNode).toBeDefined();

    // Change duration to 1 beat and pitch to 5
    const rebarred = rebarMelodyWithDurationEdit(
      EXAMPLE_SONG_01.melody,
      targetNode.melodySpan!,
      1,
      '5'
    );

    const reAst = parseClassicSong(rebarred, EXAMPLE_SONG_01.lyrics);
    const reNode = reAst.sections[0].lines
      .flatMap((l) => l.nodes)
      .find((n) => n.text === '看');
    expect(reNode).toBeDefined();
    expect((reNode!.value as Note).duration.toNumber()).toBe(1);
    expect((reNode!.value as Note).name).toBe(5);
  });

  it('decomposes compound duration 3.25 using metric splitNote subdivisions', async () => {
    const { decomposeNoteAcrossBars } = await import('../src/core/rhythmSplitter');
    const result = decomposeNoteAcrossBars('3', 3.25, 0, { upper: 4, lower: 4, hyphen: 32 });
    expect(result.bars).toEqual([['3 - - ~', '3=']]);
    expect(result.endBeatInBar).toBe(3.25);
  });

  it('supports compound duration 3.25 in rebarMelodyWithDurationEdit and parses cleanly', async () => {
    const { rebarMelodyWithDurationEdit } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 | 5 6 7 1' |`;
    const lyrics = `<tag> 主歌\n一二三四五六七八`;

    const ast = parseClassicSong(melody, lyrics);
    const node1 = ast.sections[0].lines[0].nodes.find((n) => n.text === '一')!;

    // Change note 1 duration from 1 beat to 3.25 beats
    const rebarred = rebarMelodyWithDurationEdit(melody, node1.melodySpan!, 3.25);
    expect(rebarred).toContain('1 - - ~');
    expect(rebarred).toContain('1=');

    // Verify it parses cleanly with zero errors
    const reAst = parseClassicSong(rebarred, lyrics);
    expect(reAst.errors).toBeUndefined();
  });
});

describe('Strategy A: Minimal In-Place Duration Edit (spliceMelodyNoteDuration)', () => {
  it('replaces only the target note token in-place, keeping existing "|" and all downstream text byte-for-byte identical', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const melody = `// Header Comment\n<key> C\n<time> 4/4\n\n| 1 2 3 4 | 5 6 7 1' |\n| 3 - - - |`;
    const lyrics = `<tag> 主歌\n一二三四五六七八\n九`;

    const ast = parseClassicSong(melody, lyrics);
    const node2 = ast.sections[0].lines[0].nodes.find((n) => n.text === '二')!;
    expect(node2).toBeDefined();
    expect(node2.melodySpan).toBeDefined();

    // Change note 2 duration from 1 beat to 2 beats (half note)
    const spliced = spliceMelodyNoteDuration(melody, node2.melodySpan!, 2);

    // Note 2 changed from '2' to '2 -'
    expect(spliced).toBe(
      `// Header Comment\n<key> C\n<time> 4/4\n\n| 1 2 - 3 4 | 5 6 7 1' |\n| 3 - - - |`
    );

    // Assert everything downstream starting from ' 3 4 | ...' is 100% byte-for-byte identical
    const downstreamOriginal = melody.slice(node2.melodySpan!.end);
    expect(spliced.endsWith(downstreamOriginal)).toBe(true);

    // Assert upstream before note 2 is 100% byte-for-byte identical
    const upstreamOriginal = melody.slice(0, node2.melodySpan!.start);
    expect(spliced.startsWith(upstreamOriginal)).toBe(true);
  });

  it('drops continuation dashes cleanly when shortening a 4-beat note to 1 beat', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| 1 - - - |\n| 5 6 7 1' |`;
    const lyrics = `<tag> 主歌\n一\n五六七八`;

    const ast = parseClassicSong(melody, lyrics);
    const node1 = ast.sections[0].lines[0].nodes.find((n) => n.text === '一')!;
    expect(node1).toBeDefined();

    // Shorten 1 - - - (4 beats) to 1 beat
    const spliced = spliceMelodyNoteDuration(melody, node1.melodySpan!, 1);

    expect(spliced).toBe(`<key> C\n<time> 4/4\n| 1 |\n| 5 6 7 1' |`);
    expect(spliced).not.toContain('-');
    expect(spliced).toContain('| 5 6 7 1\' |');
  });

  it('extracts target note from bracketed group without altering other bracketed notes or downstream text', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| [55566]_ 4 | 5 - - - |`;
    const lyrics = `<tag> 主歌\n一二三四五六\n七`;

    const ast = parseClassicSong(melody, lyrics);
    // '四' is the 4th note (the first '6' in [55566]_)
    const node4 = ast.sections[0].lines[0].nodes.find((n) => n.text === '四')!;
    expect(node4).toBeDefined();

    // Change 4th note duration to 1 beat
    const spliced = spliceMelodyNoteDuration(melody, node4.melodySpan!, 1);

    // [55566]_ -> [555]_ (3 notes) 6 (1 note) 6_ (1 note)
    expect(spliced).toBe(`<key> C\n<time> 4/4\n| [555]_ 6 6_ 4 | 5 - - - |`);
    expect(spliced).toContain('| 5 - - - |');
  });

  it('extracts first note from 2-note bracket group cleanly', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| [56]_ 3 4 |`;
    const lyrics = `<tag> 主歌\n一二三四`;

    const ast = parseClassicSong(melody, lyrics);
    const node1 = ast.sections[0].lines[0].nodes.find((n) => n.text === '一')!;

    // Change first note (5) duration to 1 beat
    const spliced = spliceMelodyNoteDuration(melody, node1.melodySpan!, 1);

    // [56]_ becomes 5 6_
    expect(spliced).toBe(`<key> C\n<time> 4/4\n| 5 6_ 3 4 |`);
  });

  it('updates pitch and duration simultaneously (including octave marks like 6\') in-place', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> 主歌\n一二三四`;

    const ast = parseClassicSong(melody, lyrics);
    const node2 = ast.sections[0].lines[0].nodes.find((n) => n.text === '二')!;

    // Change note 2 from 2 (1 beat) to 6' (0.5 beats)
    const spliced = spliceMelodyNoteDuration(melody, node2.melodySpan!, 0.5, "6'");
    expect(spliced).toBe(`<key> C\n<time> 4/4\n| 1 6'_ 3 4 |`);

    // Verify it parses cleanly
    const reAst = parseClassicSong(spliced, lyrics);
    expect(reAst.errors).toBeUndefined();
    const reNode2 = reAst.sections[0].lines[0].nodes.find((n) => n.text === '二')!;
    expect((reNode2.value as Note).name).toBe(6);
    expect((reNode2.value as Note).octave).toBe(1);
    expect((reNode2.value as Note).duration.toNumber()).toBe(0.5);
  });

  it('breaks the last note in [666]_ across the barline with ties and barlines when duration increases from 0.5 to 1.5 in EXAMPLE_SONG_01', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const line2 = ast.sections[0].lines[2];
    const suoNode = line2.nodes.find((n) => n.text === '所')!;
    expect(suoNode).toBeDefined();
    expect(suoNode.melodySpan).toBeDefined();

    // In EXAMPLE_SONG_01 without hyphen, modifying the last 6_ in [666]_ from 0.5 to 1.5
    // must break across the bar boundary into [66]_ 6_ ~ | 6 rather than throwing an error
    const spliced = spliceMelodyNoteDuration(
      EXAMPLE_SONG_01.melody,
      suoNode.melodySpan!,
      1.5
    );

    expect(spliced).toContain('[66]_ 6_ ~ | 6');
    expect(spliced.split('\n')[3]).toBe("[555]_ | 3. [55566]_ 4 6. [66]_ 6_ ~ | 6");

    // Verify it parses cleanly without throwing "Note goes beyond one bar in time 4/4"
    const reAst = parseClassicSong(spliced, EXAMPLE_SONG_01.lyrics);
    expect(reAst.errors).toBeUndefined();

    // Verify line 2 has the 0.5 beat tied note connected to the 1.0 beat continuation note
    const reLine2 = reAst.sections[0].lines[2];
    const reSuoNode = reLine2.nodes.find((n) => n.text === '所')!;
    expect(reSuoNode).toBeDefined();
    expect((reSuoNode.value as Note).name).toBe(6);
    expect((reSuoNode.value as Note).duration.toNumber()).toBe(0.5);
    expect((reSuoNode.value as Note).tie[1]).toBe(true);
  });

  it('supports modifying duration of a broken tied note back to fit in the current bar', async () => {
    const { spliceMelodyNoteDuration } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const line2 = ast.sections[0].lines[2];
    const suoNode = line2.nodes.find((n) => n.text === '所')!;

    // First break to 1.5 beats
    const broken = spliceMelodyNoteDuration(EXAMPLE_SONG_01.melody, suoNode.melodySpan!, 1.5);
    const brokenAst = parseClassicSong(broken, EXAMPLE_SONG_01.lyrics);
    const brokenLine2 = brokenAst.sections[0].lines[2];
    const brokenSuoNode = brokenLine2.nodes.find((n) => n.text === '所')!;

    // Now change back to 0.5 beats
    const restored = spliceMelodyNoteDuration(broken, brokenSuoNode.melodySpan!, 0.5);
    expect(restored).toContain('[66]_ 6_');
    expect(restored).not.toContain('6_ ~ | 6');

    const reAst = parseClassicSong(restored, EXAMPLE_SONG_01.lyrics);
    expect(reAst.errors).toBeUndefined();
  });

  it('synchronously updates pitch across all tied continuation notes across barlines', async () => {
    const { spliceMelodyNoteDuration, spliceMelodyPitch } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const line2 = ast.sections[0].lines[2];
    const suoNode = line2.nodes.find((n) => n.text === '所')!;

    // First break to 1.5 beats: [666]_ becomes [66]_ 6_ ~ | 6
    const broken = spliceMelodyNoteDuration(EXAMPLE_SONG_01.melody, suoNode.melodySpan!, 1.5);
    const brokenAst = parseClassicSong(broken, EXAMPLE_SONG_01.lyrics);
    const brokenSuoNode = brokenAst.sections[0].lines[2].nodes.find((n) => n.text === '所')!;

    // Modify pitch only (e.g. from 6 to 5)
    const pitchUpdated = spliceMelodyPitch(broken, brokenSuoNode.melodySpan!, '5');
    expect(pitchUpdated).toContain('[66]_ 5_ ~ | 5');
    expect(pitchUpdated).not.toContain('5_ ~ | 6');

    // Verify it parses cleanly with both tied parts having pitch 5
    const reAst = parseClassicSong(pitchUpdated, EXAMPLE_SONG_01.lyrics);
    expect(reAst.errors).toBeUndefined();
    const reSuoNode = reAst.sections[0].lines[2].nodes.find((n) => n.text === '所')!;
    expect((reSuoNode.value as Note).name).toBe(5);
  });

  it('correctly handles Unicode surrogate pairs (e.g. CJK Ext-B or emoji) as single syllables', () => {
    const melody = `<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> 主歌\n𠮷野家好`;

    const ast = parseClassicSong(melody, lyrics);
    expect(ast.errors).toBeUndefined();
    const nodes = ast.sections[0].lines[0].nodes;
    expect(nodes[0].text).toBe('𠮷');
    expect(nodes[1].text).toBe('野');
    expect(nodes[2].text).toBe('家');
    expect(nodes[3].text).toBe('好');
    expect(nodes[0].lyricSpan).toEqual({ start: 9, end: 11 });
  });
});


