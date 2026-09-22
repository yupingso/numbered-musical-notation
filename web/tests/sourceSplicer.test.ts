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
    const melodyText = `// Intro
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
    // breaks across the bar boundary into [66]_ 6_ ~ 6 rather than throwing an error
    const spliced = spliceMelodyNoteDuration(
      EXAMPLE_SONG_01.melody,
      suoNode.melodySpan!,
      1.5
    );

    expect(spliced).toContain('[66]_ 6_ ~ 6');
    expect(spliced.split('\n')[3]).toBe("[555]_ | 3. [55566]_ 4 6. [66]_ 6_ ~ 6");

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
    expect(restored).not.toContain('6_ ~ 6');

    const reAst = parseClassicSong(restored, EXAMPLE_SONG_01.lyrics);
    expect(reAst.errors).toBeUndefined();
  });

  it('synchronously updates pitch across all tied continuation notes across barlines', async () => {
    const { spliceMelodyNoteDuration, spliceMelodyPitch } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const line2 = ast.sections[0].lines[2];
    const suoNode = line2.nodes.find((n) => n.text === '所')!;

    // First break to 1.5 beats: [666]_ becomes [66]_ 6_ ~ 6
    const broken = spliceMelodyNoteDuration(EXAMPLE_SONG_01.melody, suoNode.melodySpan!, 1.5);
    const brokenAst = parseClassicSong(broken, EXAMPLE_SONG_01.lyrics);
    const brokenSuoNode = brokenAst.sections[0].lines[2].nodes.find((n) => n.text === '所')!;

    // Modify pitch only (e.g. from 6 to 5)
    const pitchUpdated = spliceMelodyPitch(broken, brokenSuoNode.melodySpan!, '5');
    expect(pitchUpdated).toContain('[66]_ 5_ ~ 5');
    expect(pitchUpdated).not.toContain('5_ ~ 6');

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

  it('editing pitch without changing duration preserves melody text exactly byte-for-byte outside target note', async () => {
    const { spliceMelodyPitch, rebarMelodyWithDurationEdit } = await import('../src/core/sourceSplicer');
    const { EXAMPLE_SONG_01 } = await import('../src/examples');

    const ast = parseClassicSong(EXAMPLE_SONG_01.melody, EXAMPLE_SONG_01.lyrics);
    const line0 = ast.sections[0].lines[0];
    const node1 = line0.nodes.find((n) => n.text === '主')!;
    expect(node1).toBeDefined();
    expect(node1.melodySpan).toBeDefined();

    // Splice pitch from 5 to 3
    const spliced = spliceMelodyPitch(EXAMPLE_SONG_01.melody, node1.melodySpan!, '3');
    // First note in [555]_ should become [355]_
    expect(spliced).toContain('[355]_');
    // The rest of the string after [355]_ must be 100% byte-for-byte identical to the original
    expect(spliced.slice(spliced.indexOf('[355]_') + 6)).toBe(
      EXAMPLE_SONG_01.melody.slice(EXAMPLE_SONG_01.melody.indexOf('[555]_') + 6)
    );

    // Also verify rebarMelodyWithDurationEdit delegates cleanly without downstream rebarring when duration does not change
    const rebarSpliced = rebarMelodyWithDurationEdit(
      EXAMPLE_SONG_01.melody,
      node1.melodySpan!,
      (node1.value as Note).duration.toNumber(),
      '3'
    );
    expect(rebarSpliced).toBe(spliced);
  });

  describe('Title Slide Metadata Parsing & Splicing', () => {
    it('parses title slide metadata from lyrics without consuming musical syllables', async () => {
      const { parseSongMetadata } = await import('../src/core/parserClassic');
      const melody = `<time> 4/4\n| 1 2 3 4 |`;
      const lyrics = `<title> 不動搖的信心\n<subtitle> Unshakeable Faith\n<album> 讚美之泉 22\n<credits> 詞：游智婷 / 曲：曾祥怡\n<tag> 主歌\n主 賜 給 我`;

      const ast = parseClassicSong(melody, lyrics);
      expect(ast.metadata).toEqual({
        title: '不動搖的信心',
        subtitle: 'Unshakeable Faith',
        album: '讚美之泉 22',
        credits: '詞：游智婷 / 曲：曾祥怡',
      });
      expect(parseSongMetadata(lyrics, melody)).toEqual(ast.metadata);

      // Verify that the 4 lyrics words aligned with the 4 melody notes
      expect(ast.sections[0].lines[0].nodes.map((n) => n.text).filter(Boolean)).toEqual([
        '主',
        '賜',
        '給',
        '我',
      ]);
    });

    it('surgically inserts new metadata at the top of lyricsText (updateLyricsMetadata)', async () => {
      const { updateLyricsMetadata } = await import('../src/core/sourceSplicer');
      const lyrics = `<tag> 主歌\n主 賜 給 我`;
      const updated = updateLyricsMetadata(lyrics, {
        title: '不動搖的信心',
        subtitle: 'Unshakeable Faith',
      });

      expect(updated).toBe(
        `<title> 不動搖的信心\n<subtitle> Unshakeable Faith\n<tag> 主歌\n主 賜 給 我`
      );
    });

    it('surgically updates existing metadata in-place without touching other lines', async () => {
      const { updateLyricsMetadata } = await import('../src/core/sourceSplicer');
      const lyrics = `<title> 舊標題\n<subtitle> Old Subtitle\n<tag> 主歌\n主 賜 給 我`;
      const updated = updateLyricsMetadata(lyrics, {
        title: '新標題',
        album: '讚美之泉 22',
      });

      expect(updated).toBe(
        `<title> 新標題\n<subtitle> Old Subtitle\n<album> 讚美之泉 22\n<tag> 主歌\n主 賜 給 我`
      );
    });

    it('removes metadata directive when value is cleared with empty string', async () => {
      const { updateLyricsMetadata } = await import('../src/core/sourceSplicer');
      const lyrics = `<title> 標題\n<subtitle> 英文\n<tag> 主歌\n主 賜 給 我`;
      const updated = updateLyricsMetadata(lyrics, {
        subtitle: '',
      });

      expect(updated).toBe(`<title> 標題\n<tag> 主歌\n主 賜 給 我`);
    });

    it('serializes multi-line title and subtitle using literal \\n in updateLyricsMetadata', async () => {
      const { updateLyricsMetadata } = await import('../src/core/sourceSplicer');
      const lyrics = `<tag> 主歌\n主 賜 給 我`;
      const updated = updateLyricsMetadata(lyrics, {
        title: '一生一世\n在主的殿中',
        subtitle: 'All the Days of My Life\nIn the House of the Lord',
      });

      expect(updated).toBe(
        `<title> 一生一世\\n在主的殿中\n<subtitle> All the Days of My Life\\nIn the House of the Lord\n<tag> 主歌\n主 賜 給 我`
      );
    });
  });

  describe('Lyric Slur Group Splicing & Context (Item 3)', () => {
    it('tracks slur group metadata (slurRootLyric, slurCount, slurIndex, slurSpans) across multi-unit slurs', () => {
      const melody = `<time> 4/4\n| 1 2 3 5 |`;
      const lyrics = `<tag> 主歌\n你 救~ 恩`;

      const ast = parseClassicSong(melody, lyrics);
      expect(ast.errors).toBeUndefined();
      const units = ast.sections[0].lines[0].units;
      expect(units).toHaveLength(4);

      // Unit 0: "你" (single-unit group)
      expect(units[0].lyric).toBe('你');
      expect(units[0].slurRootLyric).toBe('你');
      expect(units[0].slurCount).toBe(1);
      expect(units[0].slurIndex).toBe(1);
      expect(units[0].slurSpans).toEqual([]);

      // Unit 1: "救" (1/2 of "救~")
      expect(units[1].lyric).toBe('救');
      expect(units[1].slurRootLyric).toBe('救');
      expect(units[1].slurCount).toBe(2);
      expect(units[1].slurIndex).toBe(1);
      expect(units[1].slurSpans).toHaveLength(1);

      // Unit 2: "~" (2/2 of "救~")
      expect(units[2].lyric).toBeUndefined();
      expect(units[2].slurRootLyric).toBe('救');
      expect(units[2].slurCount).toBe(2);
      expect(units[2].slurIndex).toBe(2);
      expect(units[2].slurRootLyricSpan).toEqual(units[1].lyricSpan);
      expect(units[2].slurSpans).toEqual(units[1].slurSpans);

      // Unit 3: "恩" (single-unit group)
      expect(units[3].lyric).toBe('恩');
      expect(units[3].slurCount).toBe(1);
    });

    it('surgically expands and breaks lyric groups with spliceExpandLyricGroup and spliceBreakLyricGroup', async () => {
      const { spliceExpandLyricGroup, spliceBreakLyricGroup } = await import('../src/core/sourceSplicer');

      const melody = `<time> 4/4\n| 1 2 3 5 |`;
      const initialLyrics = `<tag> 主歌\n你 看 救，恩`;
      const ast1 = parseClassicSong(melody, initialLyrics);
      const unitJiu = ast1.sections[0].lines[0].units[2]; // "救"

      // Expand "救" once -> "救~，恩"
      const expanded1 = spliceExpandLyricGroup(
        initialLyrics,
        unitJiu.slurRootLyricSpan!,
        unitJiu.slurSpans
      );
      expect(expanded1).toBe(`<tag> 主歌\n你 看 救~，恩`);

      // Parse again and expand from 2nd unit of "救~" -> "救~~，恩"
      const ast2 = parseClassicSong(melody, expanded1);
      const unitJiu2nd = ast2.sections[0].lines[0].units[3]; // 2nd unit of group
      expect(unitJiu2nd.slurRootLyric).toBe('救');
      expect(unitJiu2nd.slurCount).toBe(2);

      const expanded2 = spliceExpandLyricGroup(
        expanded1,
        unitJiu2nd.slurRootLyricSpan!,
        unitJiu2nd.slurSpans
      );
      expect(expanded2).toBe(`<tag> 主歌\n你 看 救~~，恩`);

      // Break entire 3-unit group from any unit -> back to "你 看 救，恩"
      const ast3 = parseClassicSong(`<time> 4/4\n| 1 2 3 5 6 |`, expanded2);
      const unitIn3Group = ast3.sections[0].lines[0].units[3];
      expect(unitIn3Group.slurCount).toBe(3);

      const broken = spliceBreakLyricGroup(expanded2, unitIn3Group.slurSpans!);
      expect(broken).toBe(initialLyrics);

      // Verify horizontal whitespace (spaces, tabs, full-width spaces) collapses cleanly around standalone ~ tokens
      const spacedLyrics = `<tag> 主歌\n主  ~   ~  愛\n我\u3000~\u3000心`;
      const astSpaced = parseClassicSong(
        `<time> 4/4\n| 1 2 3 4 | 5 6 7 - |`,
        spacedLyrics
      );
      const uZhu = astSpaced.sections[0].lines[0].units[0];
      const uWo = astSpaced.sections[0].lines[1].units[0];

      let cleaned = spliceBreakLyricGroup(spacedLyrics, uWo.slurSpans!);
      cleaned = spliceBreakLyricGroup(cleaned, uZhu.slurSpans!);
      expect(cleaned).toBe(`<tag> 主歌\n主 愛\n我\u3000心`);
      expect(spliceBreakLyricGroup('你\t~\t恩', [{ start: 2, end: 3 }])).toBe('你\t恩');
    });

    it('enforces group UI rules in buildUnitContext (single-unit neighbor & no rest in between)', async () => {
      const { buildUnitContext } = await import('../src/components/InteractiveSlideCanvas');
      const { splitAstIntoSlides } = await import('../src/core/svgRenderer');

      // Line: Unit 0 ("你"), Unit 1 ("看"), Unit 2 ("救"), Unit 3 ("~"), Unit 4 (rest "0"), Unit 5 ("恩")
      const melody = `<time> 4/4\n| 1 2 3 5 | 0 6 - - |`;
      const lyrics = `<tag> 主歌\n你 看 救~ 恩`;

      const ast = parseClassicSong(melody, lyrics);
      const slides = splitAstIntoSlides(ast.sections);
      const slide = slides[0];

      // 1. Focus Unit 0 ("你"): next group is Unit 1 ("看", single unit) -> canExpandGroup = true, canBreakGroup = false
      const ctx0 = buildUnitContext(0, 0, slide);
      expect(ctx0?.canExpandGroup).toBe(true);
      expect(ctx0?.canBreakGroup).toBe(false);

      // 2. Focus Unit 1 ("看"): next group is "救~" (2-unit group!) -> canExpandGroup = false
      const ctx1 = buildUnitContext(0, 1, slide);
      expect(ctx1?.canExpandGroup).toBe(false);
      expect(ctx1?.canBreakGroup).toBe(false);

      // 3. Focus Unit 2 ("救", 1st unit of 2-unit group):
      //    Next unit after group is Unit 4 (rest "0"!) -> canExpandGroup = false, canBreakGroup = true
      const ctx2 = buildUnitContext(0, 2, slide);
      expect(ctx2?.canExpandGroup).toBe(false);
      expect(ctx2?.canBreakGroup).toBe(true);
      expect(ctx2?.initialLyric).toBe('救');

      // 4. Focus Unit 3 ("~", 2nd unit of 2-unit group):
      //    Same group behavior as Unit 2: initialLyric is "救", canBreakGroup = true, canExpandGroup = false
      const ctx3 = buildUnitContext(0, 3, slide);
      expect(ctx3?.canExpandGroup).toBe(false);
      expect(ctx3?.canBreakGroup).toBe(true);
      expect(ctx3?.initialLyric).toBe('救');
      expect(ctx3?.groupLyricSpan).toEqual(ctx2?.groupLyricSpan);
    });

    it('disallows grouping same-pitch neighbors (ties) and allows grouping across line/slide ends', async () => {
      const { buildUnitContext } = await import('../src/components/InteractiveSlideCanvas');
      const { splitAstIntoSlides } = await import('../src/core/svgRenderer');
      const { spliceExpandLyricGroup } = await import('../src/core/sourceSplicer');

      // Line 1: 1 (你), 1 (看 - same pitch as 你!), 3 (救)
      // Line 2: 5 (恩 - different pitch from 3!), 5 (典 - same pitch as 恩)
      const melody = `<time> 4/4\n| 1 1 3 5 | 5 - - - |`;
      const lyrics = `<tag> 主歌\n你 看 救\n恩 典`;

      const ast = parseClassicSong(melody, lyrics);
      const slides = splitAstIntoSlides(ast.sections);
      const slide = slides[0];

      // 1. Unit 0 ("你", pitch 1) followed by Unit 1 ("看", pitch 1): same pitch -> tie, NOT slur -> canExpandGroup = false
      const ctx0 = buildUnitContext(0, 0, slide);
      expect(ctx0?.canExpandGroup).toBe(false);

      // 2. Unit 1 ("看", pitch 1) followed by Unit 2 ("救", pitch 3): different pitch -> canExpandGroup = true
      const ctx1 = buildUnitContext(0, 1, slide);
      expect(ctx1?.canExpandGroup).toBe(true);

      // 3. Unit 2 ("救", pitch 3, at the END of Line 1) followed by Line 2's first unit ("恩", pitch 5):
      //    Different pitch across line break -> canExpandGroup = true!
      const ctx2 = buildUnitContext(0, 2, slide);
      expect(ctx2?.canExpandGroup).toBe(true);

      // Expanding "救" at the end of Line 1 merges "恩"'s melody unit (pitch 5) into Line 1!
      const expandedLyrics = spliceExpandLyricGroup(
        lyrics,
        ctx2!.groupLyricSpan!,
        ctx2!.unit?.slurSpans
      );
      expect(expandedLyrics).toBe(`<tag> 主歌\n你 看 救~\n恩 典`);
      const astAfter = parseClassicSong(melody, expandedLyrics);
      expect(astAfter.sections[0].lines[0].units.length).toBe(4); // 1, 1, 3, 5 all on Line 1 now!
      expect(astAfter.sections[0].lines[0].units[2].slurCount).toBe(2);
    });

    it('treats courtesy natural (%1) as same pitch as unmarked natural (1) for canExpandGroup', async () => {
      const { buildUnitContext } = await import('../src/components/InteractiveSlideCanvas');
      const { splitAstIntoSlides } = await import('../src/core/svgRenderer');

      const melody = `<time> 4/4\n| 1 %1 2 - |`;
      const lyrics = `<tag> 主歌\n你 看 救`;

      const ast = parseClassicSong(melody, lyrics);
      const slides = splitAstIntoSlides(ast.sections);
      const slide = slides[0];

      // 1 followed by %1 is same pitch -> tie, not slur -> canExpandGroup = false
      const ctx0 = buildUnitContext(0, 0, slide);
      expect(ctx0?.canExpandGroup).toBe(false);

      // %1 followed by 2 is different pitch -> canExpandGroup = true
      const ctx1 = buildUnitContext(0, 1, slide);
      expect(ctx1?.canExpandGroup).toBe(true);
    });

    it('updates slide preview when linking notes even while melody is partially typed or has bar overflow', async () => {
      const { SvgRenderer, splitAstIntoSlides } = await import('../src/core/svgRenderer');
      const { spliceExpandLyricGroup } = await import('../src/core/sourceSplicer');

      // Full lyrics typed first, only partial melody typed (with a bar overflow on the trailing note)
      const fullLyrics = `<tag> 主歌\n主阿我神\n我每逢舉目觀看`;
      const partialMelody = `<key> C\n<time> 4/4\n1 2 3 5 -`;

      const astBefore = parseClassicSong(partialMelody, fullLyrics);
      expect(astBefore.errors).toBeDefined();
      expect(astBefore.sections.length).toBeGreaterThan(0);

      const u0 = astBefore.sections[0].lines[0].units[0];
      const newLyrics = spliceExpandLyricGroup(
        fullLyrics,
        u0.slurRootLyricSpan || u0.lyricSpan!,
        u0.slurSpans
      );
      expect(newLyrics).toContain('主~阿我神');

      const astAfter = parseClassicSong(partialMelody, newLyrics);
      const slidesAfter = splitAstIntoSlides(astAfter.sections);
      expect(slidesAfter.length).toBeGreaterThan(0);
      expect(slidesAfter[0].line1.slurs).toEqual([{ start: 0, end: 1 }]);

      const renderer = new SvgRenderer();
      const svgBefore = renderer.renderSlide(splitAstIntoSlides(astBefore.sections)[0]);
      const svgAfter = renderer.renderSlide(slidesAfter[0]);
      expect(svgAfter).not.toBe(svgBefore);
    });
  });

  describe('.nmn Source File Serialization & Parsing', () => {
    it('round-trips melody and lyrics via serializeNmnSource and parseNmnSource', async () => {
      const { serializeNmnSource, parseNmnSource } = await import('../src/core/sourceFile');
      const melody = `<key> C\n<time> 4/4\n| 1 2 3 5 |`;
      const lyrics = `<title> 你真偉大\n<tag> 主歌\n主阿我神`;

      const serialized = serializeNmnSource(melody, lyrics);
      const parsedObj = JSON.parse(serialized);
      expect(parsedObj.version).toBe(1);
      expect(parsedObj.melody).toBe(melody);
      expect(parsedObj.lyrics).toBe(lyrics);

      const roundTripped = parseNmnSource(serialized);
      expect(roundTripped).toEqual({ melody, lyrics });
    });

    it('rejects malformed JSON or missing fields in parseNmnSource', async () => {
      const { parseNmnSource } = await import('../src/core/sourceFile');
      expect(() => parseNmnSource('not json')).toThrow('無效的 .nmn 原始檔格式');
      expect(() => parseNmnSource(JSON.stringify({ version: 1, melody: '1 2 3' }))).toThrow(
        '缺少旋律 (melody) 或歌詞 (lyrics) 欄位'
      );
      expect(() => parseNmnSource(JSON.stringify({ version: 1, melody: 123, lyrics: 'abc' }))).toThrow(
        '缺少旋律 (melody) 或歌詞 (lyrics) 欄位'
      );
    });

    it('derives sanitized filename stems from metadata title', async () => {
      const { getSongFileStem } = await import('../src/core/sourceFile');
      expect(getSongFileStem(undefined, 'nmn_song')).toBe('nmn_song');
      expect(getSongFileStem({ title: '你真偉大' }, 'nmn_song')).toBe('你真偉大');
      expect(getSongFileStem({ title: '你真偉大\\nHow Great Thou Art' }, 'nmn_song')).toBe('你真偉大');
      expect(getSongFileStem({ title: '奇異恩典: Amazing / Grace?' }, 'nmn_song')).toBe(
        '奇異恩典_ Amazing _ Grace_'
      );
    });
  });
});


