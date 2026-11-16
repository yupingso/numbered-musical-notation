import { describe, it, expect } from 'vitest';
import { parseClassicSong } from '../src/core/parserClassic';
import {
  spliceMelodyPitch,
  modifyMelodicUnitDuration,
} from '../src/core/sourceSplicer';

describe('MelodicUnit AST Construction', () => {
  it('constructs independent single-pitch MelodicUnits for standard notes', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);

    const line = ast.sections[0].lines[0];
    expect(line.units).toHaveLength(4);

    expect(line.units[0].pitch.name).toBe(1);
    expect(line.units[0].duration.toNumber()).toBe(1.0);
    expect(line.units[0].lyric).toBe('A');
    expect(line.units[0].segments).toHaveLength(1);

    expect(line.units[1].pitch.name).toBe(2);
    expect(line.units[1].duration.toNumber()).toBe(1.0);
    expect(line.units[1].lyric).toBe('B');

    expect(line.units[2].pitch.name).toBe(3);
    expect(line.units[2].duration.toNumber()).toBe(1.0);
    expect(line.units[2].lyric).toBe('C');

    expect(line.units[3].pitch.name).toBe(4);
    expect(line.units[3].duration.toNumber()).toBe(1.0);
    expect(line.units[3].lyric).toBe('D');
  });

  it('unifies true ties across barlines (same pitch) into ONE MelodicUnit', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3_ 4_ 5 6 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);

    const line = ast.sections[0].lines[0];
    // Notes: 1, 2, 3 tied to 3_, 4_, 5, 6 -> 6 MelodicUnits total
    expect(line.units).toHaveLength(6);

    const tiedUnit = line.units[2];
    expect(tiedUnit.pitch.name).toBe(3);
    // Duration: 2.0 (from 3 - ~) + 0.5 (from 3_) = 2.5 beats
    expect(tiedUnit.duration.toNumber()).toBe(2.5);
    expect(tiedUnit.lyric).toBe('C');
    expect(tiedUnit.segments).toHaveLength(2);

    expect(tiedUnit.segments[0].duration.toNumber()).toBe(2.0);
    expect(tiedUnit.segments[0].tiedNext).toBe(true);

    expect(tiedUnit.segments[1].duration.toNumber()).toBe(0.5);
    expect(tiedUnit.segments[1].tiedPrev).toBe(true);

    // Next note after the tie is 4_
    expect(line.units[3].pitch.name).toBe(4);
    expect(line.units[3].duration.toNumber()).toBe(0.5);
    expect(line.units[3].lyric).toBe('D');
  });

  it('disallows ties (~) between different pitches or rests in melody.txt', () => {
    const cases = [
      `<key> C\n<time> 4/4\n| 1~2 3 4 |`,
      `<key> C\n<time> 4/4\n| 1~0 3 4 |`,
      `<key> C\n<time> 4/4\n| 0~1 3 4 |`,
      `<key> C\n<time> 4/4\n| 0~0 3 4 |`,
      `<key> C\n<time> 4/4 hyphen=16\n| 1---~0--- 3--- 4--- |`,
    ];
    for (const melody of cases) {
      const ast = parseClassicSong(melody, `<tag> Verse 1\nA B C D`);
      expect(ast.errors).toContain('Tie (~) in melody must connect notes of the same pitch');
    }
  });

  it('allows courtesy natural ties (~) in melody.txt', () => {
    const cases = [
      `<key> C\n<time> 4/4\n| 1~%1 2 3 |`,
      `<key> C\n<time> 4/4\n| %1~1 2 3 |`,
    ];
    for (const melody of cases) {
      const ast = parseClassicSong(melody, `<tag> Verse 1\nA B C`);
      expect(ast.errors).toBeUndefined();
      expect(ast.sections[0].lines[0].units).toHaveLength(3);
      expect(ast.sections[0].lines[0].units[0].duration.toNumber()).toBe(2.0);
    }
  });

  it('handles multi-note slur in lyrics.txt (A ~ ~ B) creating 3 distinct MelodicUnits with single syllable', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA ~ ~ B`;
    const ast = parseClassicSong(melody, lyrics);

    const line = ast.sections[0].lines[0];
    expect(line.units).toHaveLength(4);

    expect(line.units[0].pitch.name).toBe(1);
    expect(line.units[0].lyric).toBe('A');
    expect(line.units[0].slurToNext).toBe(true);

    expect(line.units[1].pitch.name).toBe(2);
    expect(line.units[1].lyric).toBeUndefined();
    expect(line.units[1].slurFromPrev).toBe(true);
    expect(line.units[1].slurToNext).toBe(true);

    expect(line.units[2].pitch.name).toBe(3);
    expect(line.units[2].lyric).toBeUndefined();
    expect(line.units[2].slurFromPrev).toBe(true);

    expect(line.units[3].pitch.name).toBe(4);
    expect(line.units[3].lyric).toBe('B');
  });

  it('tracks bracket context for notes inside [1234]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);

    const line = ast.sections[0].lines[0];
    expect(line.units).toHaveLength(5);

    for (let k = 0; k < 4; k++) {
      const unit = line.units[k];
      expect(unit.duration.toNumber()).toBe(0.5);
      expect(unit.segments[0].bracket).toBeDefined();
      expect(unit.segments[0].bracket?.indexInGroup).toBe(k);
      expect(unit.segments[0].bracket?.totalInGroup).toBe(4);
      expect(unit.segments[0].bracket?.durationSuffix).toBe('_');
    }
  });
});

describe('Canonical Bracket Splitting & Suffix Preservation', () => {
  it('2-note bracket [12]_: head note 1 edited -> 1 2_', () => {
    const melody = `<key> C\n<time> 4/4\n| [12]_ 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit1 = ast.sections[0].lines[0].units[0];

    const updated = modifyMelodicUnitDuration(melody, unit1, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2_ 3 4 |`);
  });

  it('2-note bracket [12]_: tail note 2 edited -> 1_ 2', () => {
    const melody = `<key> C\n<time> 4/4\n| [12]_ 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit2 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit2, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1_ 2 3 4 |`);
  });

  it('3-note bracket [123]_: head note 1 edited -> 1 [23]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [123]_ 4. |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit1 = ast.sections[0].lines[0].units[0];

    const updated = modifyMelodicUnitDuration(melody, unit1, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 [23]_ 4. |`);
  });

  it('3-note bracket [123]_: middle note 2 edited -> 1_ 2 3_', () => {
    const melody = `<key> C\n<time> 4/4\n| [123]_ 4. |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit2 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit2, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1_ 2 3_ 4. |`);
  });

  it('3-note bracket [123]_: tail note 3 edited -> [12]_ 3', () => {
    const melody = `<key> C\n<time> 4/4\n| [123]_ 4. |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit3 = ast.sections[0].lines[0].units[2];

    const updated = modifyMelodicUnitDuration(melody, unit3, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| [12]_ 3 4. |`);
  });

  it('4-note bracket [1234]_: head note 1 edited -> 1 [234]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);
    const unit1 = ast.sections[0].lines[0].units[0];

    const updated = modifyMelodicUnitDuration(melody, unit1, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 [234]_ 5 - |`);
  });

  it('4-note bracket [1234]_: mid-left note 2 edited -> 1_ 2 [34]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);
    const unit2 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit2, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1_ 2 [34]_ 5 - |`);
  });

  it('4-note bracket [1234]_: mid-right note 3 edited -> [12]_ 3 4_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);
    const unit3 = ast.sections[0].lines[0].units[2];

    const updated = modifyMelodicUnitDuration(melody, unit3, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| [12]_ 3 4_ 5 - |`);
  });

  it('4-note bracket [1234]_: tail note 4 edited -> [123]_ 4', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);
    const unit4 = ast.sections[0].lines[0].units[3];

    const updated = modifyMelodicUnitDuration(melody, unit4, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| [123]_ 4 5 - |`);
  });

  it('5-note bracket [12345]_: middle note 3 edited -> [12]_ 3 [45]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [12345]_ 6 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);
    const unit3 = ast.sections[0].lines[0].units[2];

    const updated = modifyMelodicUnitDuration(melody, unit3, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| [12]_ 3 [45]_ 6 |`);
  });

  it('sixteenth bracket [123]=: middle note 2 edited -> 1= 2_ 3=', () => {
    const melody = `<key> C\n<time> 4/4\n| [123]= 4 - |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unit2 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit2, 0.5);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1= 2_ 3= 4 - |`);
  });

  it('bracket with rest note [1 0 2]_: rest duration edited -> 1_ 0 2_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1 0 2]_ 3 - |`;
    const lyrics = `<tag> Verse 1\nA B C D`;
    const ast = parseClassicSong(melody, lyrics);
    const unitRest = ast.sections[0].lines[0].units[1]; // rest 0
    expect(unitRest.pitch.isRest).toBe(true);

    const updated = modifyMelodicUnitDuration(melody, unitRest, 1.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1_ 0 2_ 3 - |`);
  });

  it('in-place pitch edit inside bracket replaces pitch glyph cleanly: [1234]_ -> [1#2\'34]_', () => {
    const melody = `<key> C\n<time> 4/4\n| [1234]_ 5 - |`;
    const lyrics = `<tag> Verse 1\nA B C D E`;
    const ast = parseClassicSong(melody, lyrics);
    const unit2 = ast.sections[0].lines[0].units[1];

    const updated = spliceMelodyPitch(melody, unit2, "#2'");
    expect(updated).toBe(`<key> C\n<time> 4/4\n| [1#2'34]_ 5 - |`);
  });
});

describe('Slurs vs Ties Duration & Pitch Modifications', () => {
  it('slur head duration edit preserves slur grouping: 1 2 (A ~ B) -> 1 - 2', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA ~ B C`;
    const ast = parseClassicSong(melody, lyrics);
    const unit0 = ast.sections[0].lines[0].units[0];

    const updated = modifyMelodicUnitDuration(melody, unit0, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 - 2 3 4 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('slur tail duration edit preserves slur grouping: 1 2 (A ~ B) -> 1 2 -', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA ~ B C`;
    const ast = parseClassicSong(melody, lyrics);
    const unit1 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit1, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 - 3 4 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('modifies multi-segment tied unit across barlines back into single bar cleanly', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3_ 4_ 5 6 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);
    const tiedUnit = ast.sections[0].lines[0].units[2];
    expect(tiedUnit.duration.toNumber()).toBe(2.5);

    // Shorten from 2.5 beats to 2.0 beats (fits in bar 0: 2 beats remaining)
    const updated = modifyMelodicUnitDuration(melody, tiedUnit, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3 - | 4_ 5 6 |`);
  });

  it('modifies multi-segment tied unit across barlines with new extended duration preserving existing barline', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3_ 4_ 5 6 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);
    const tiedUnit = ast.sections[0].lines[0].units[2];

    // Lengthen from 2.5 beats to 3.5 beats (2 beats in bar 0 + 1.5 beats in bar 1)
    const updated = modifyMelodicUnitDuration(melody, tiedUnit, 3.5);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3. 4_ 5 6 |`);
  });

  it('shortens multi-segment tied unit without existing barline without injecting stray barline', () => {
    const melody = `<key> C\n<time> 4/4\n1 2 3 - ~ 3_ 4_ 5 6`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);
    const tiedUnit = ast.sections[0].lines[0].units[2];

    const updated = modifyMelodicUnitDuration(melody, tiedUnit, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n1 2 3 - 4_ 5 6`);
    expect(updated).not.toContain('|');
  });

  it('synchronously updates pitch across all segments of a tied unit across barlines', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3_ 4_ 5 6 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);
    const tiedUnit = ast.sections[0].lines[0].units[2];

    const updated = spliceMelodyPitch(melody, tiedUnit, '5');
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 5 - ~ | 5_ 4_ 5 6 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
    const reUnit = newAst.sections[0].lines[0].units[2];
    expect(reUnit.pitch.name).toBe(5);
    expect(reUnit.segments).toHaveLength(2);
  });

  it('preserves intra-bar syncopated tied segments when editing pitch (3_2_3_1=1=~1_6. -> 3_2_3_1\'=1\'=~1\'_6.)', () => {
    let melody = `<key> C\n<time> 4/4\n3_2_3_1=1=~1_6.`;
    const lyrics = `<tag> 主歌\n甲乙丙丁戊~`;

    // Edit 4th MelodicUnit (standalone 1=) to 1'
    let ast = parseClassicSong(melody, lyrics);
    expect(ast.errors).toBeUndefined();
    const unit3 = ast.sections[0].lines[0].units[3];
    expect(unit3.segments).toHaveLength(1);
    melody = spliceMelodyPitch(melody, unit3, "1'");
    expect(melody).toBe(`<key> C\n<time> 4/4\n3_2_3_1'=1=~1_6.`);

    // Edit 5th MelodicUnit (tied 1=~1_) to 1': must stay 1'=~1'_ and never collapse into 1'_.
    ast = parseClassicSong(melody, lyrics);
    expect(ast.errors).toBeUndefined();
    const unit4 = ast.sections[0].lines[0].units[4];
    expect(unit4.segments).toHaveLength(2);
    expect(unit4.duration.toNumber()).toBe(0.75);

    melody = spliceMelodyPitch(melody, unit4, "1'");
    expect(melody).toBe(`<key> C\n<time> 4/4\n3_2_3_1'=1'=~1'_6.`);

    const reAst = parseClassicSong(melody, lyrics);
    expect(reAst.errors).toBeUndefined();
    expect(reAst.sections[0].lines[0].ties).toHaveLength(1);
    expect(reAst.sections[0].lines[0].units[4].segments).toHaveLength(2);
    expect(reAst.sections[0].lines[0].units[4].pitch.name).toBe(1);
    expect(reAst.sections[0].lines[0].units[4].pitch.octave).toBe(1);
  });

  it('preserves 3-segment intra-bar ties and non-canonical cross-barline subdivisions on pitch edit', () => {
    // 3-segment intra-bar tie: 1=~1_~1 (0.5 + 0.25 + 1.75 + 0.5 + 1.0 = 4.0 beats)
    const intraMelody = `<key> C\n<time> 4/4\n| 3_ 2= 1=~1_~1 6_ 5 |`;
    const intraLyrics = `<tag> 主歌\n一二三四五`;
    const intraAst = parseClassicSong(intraMelody, intraLyrics);
    expect(intraAst.errors).toBeUndefined();
    const intraTied = intraAst.sections[0].lines[0].units[2];
    expect(intraTied.segments).toHaveLength(3);

    const intraUpdated = spliceMelodyPitch(intraMelody, intraTied, '5');
    expect(intraUpdated).toBe(`<key> C\n<time> 4/4\n| 3_ 2= 5=~5_~5 6_ 5 |`);
    expect(parseClassicSong(intraUpdated, intraLyrics).errors).toBeUndefined();

    // Cross-barline tie followed by intra-bar subdivision in bar 2: 1~ | 1=1=~1_
    const crossMelody = `<key> C\n<time> 4/4\n| 3 2 5 1~ | 1=1=~1_ 6. 5. |`;
    const crossLyrics = `<tag> 主歌\n一二三四五六七`;
    const crossAst = parseClassicSong(crossMelody, crossLyrics);
    expect(crossAst.errors).toBeUndefined();
    const crossTied = crossAst.sections[0].lines[0].units[3];
    expect(crossTied.segments).toHaveLength(2);

    // Edit the cross-barline 1~ | 1= first, then the intra-bar 1=~1_
    const step1 = spliceMelodyPitch(crossMelody, crossTied, "1'");
    expect(step1).toBe(`<key> C\n<time> 4/4\n| 3 2 5 1'~ | 1'=1=~1_ 6. 5. |`);
    const step1Ast = parseClassicSong(step1, crossLyrics);
    const bar2Tied = step1Ast.sections[0].lines[0].units[4];
    const step2 = spliceMelodyPitch(step1, bar2Tied, "1'");
    expect(step2).toBe(`<key> C\n<time> 4/4\n| 3 2 5 1'~ | 1'=1'=~1'_ 6. 5. |`);
    expect(parseClassicSong(step2, crossLyrics).errors).toBeUndefined();

    // Multi-segment cross-barline chain: 1~ | 1=~1_ (0.25 + 0.5 + 0.25 + 3.0 = 4.0 beats in bar 2)
    const chainMelody = `<key> C\n<time> 4/4\n| 3 2 5 1~ | 1=~1_ 6= 5 - - |`;
    const chainLyrics = `<tag> 主歌\n一二三四五六`;
    const chainAst = parseClassicSong(chainMelody, chainLyrics);
    expect(chainAst.errors).toBeUndefined();
    const chainTied = chainAst.sections[0].lines[0].units[3];
    expect(chainTied.segments).toHaveLength(3);
    const chainUpdated = spliceMelodyPitch(chainMelody, chainTied, "1'");
    expect(chainUpdated).toBe(`<key> C\n<time> 4/4\n| 3 2 5 1'~ | 1'=~1'_ 6= 5 - - |`);
    expect(parseClassicSong(chainUpdated, chainLyrics).errors).toBeUndefined();
  });

  it('handles pitch and duration edits on ties involving bracketed groups ([31]=~1_, 1=~[16]_, [31]=~[16]_)', () => {
    // 1. Leading bracket tied to unbracketed note (including spaces around '~'): [31]= ~ 1_
    const m1 = `<key> C\n<time> 4/4\n| [31]=~1_ 2 3 4 |`;
    const l1 = `<tag> 主歌\n一二三四五`;
    const ast1 = parseClassicSong(m1, l1);
    expect(ast1.errors).toBeUndefined();
    const u1 = ast1.sections[0].lines[0].units[1];
    expect(u1.segments).toHaveLength(2);
    expect(spliceMelodyPitch(m1, u1, "1'")).toBe(`<key> C\n<time> 4/4\n| [31']=~1'_ 2 3 4 |`);
    expect(modifyMelodicUnitDuration(m1, u1, 0.5)).toBe(`<key> C\n<time> 4/4\n| 3= 1_ 2 3 4 |`);

    const m1Spaced = `<key> C\n<time> 4/4\n| [3 1]= ~ 1_ 2 3 4 |`;
    const ast1Spaced = parseClassicSong(m1Spaced, l1);
    expect(ast1Spaced.errors).toBeUndefined();
    expect(modifyMelodicUnitDuration(m1Spaced, ast1Spaced.sections[0].lines[0].units[1], 0.5)).toBe(
      `<key> C\n<time> 4/4\n| 3= 1_ 2 3 4 |`
    );

    // Intra-bar multi-segment tied unit right before '|' splits across the existing barline on overflow
    const mEndBar = `<key> C\n<time> 4/4\n| 3 2 5 6=1=~1_ | 4 3 2 1 |`;
    const lEndBar = `<tag> 主歌\n一二三四五六七八九`;
    const astEndBar = parseClassicSong(mEndBar, lEndBar);
    expect(astEndBar.errors).toBeUndefined();
    expect(
      modifyMelodicUnitDuration(mEndBar, astEndBar.sections[0].lines[0].units[4], 1.75)
    ).toBe(`<key> C\n<time> 4/4\n| 3 2 5 6=1_. ~ | 1 4 3 2 1 |`);

    // 2. Unbracketed note tied into leading note of bracket: 1=~[16]_ (0.5 + 0.25 + 0.25 + 0.5 + 0.5 + 2.0 = 4.0)
    const m2 = `<key> C\n<time> 4/4\n| 3_ 2= 1=~[16]_ 2 - |`;
    const l2 = `<tag> 主歌\n一二三四五`;
    const ast2 = parseClassicSong(m2, l2);
    expect(ast2.errors).toBeUndefined();
    const u2 = ast2.sections[0].lines[0].units[2];
    expect(u2.segments).toHaveLength(2);
    expect(spliceMelodyPitch(m2, u2, "1'")).toBe(`<key> C\n<time> 4/4\n| 3_ 2= 1'=~[1'6]_ 2 - |`);
    expect(modifyMelodicUnitDuration(m2, u2, 0.25)).toBe(`<key> C\n<time> 4/4\n| 3_ 2= 1= 6_ 2 - |`);

    // 3. Bracket tied to bracket: [31]=~[16]_
    const m3 = `<key> C\n<time> 4/4\n| [31]=~[16]_ 2_ 3 4 |`;
    const l3 = `<tag> 主歌\n一二三四五六`;
    const ast3 = parseClassicSong(m3, l3);
    expect(ast3.errors).toBeUndefined();
    const u3 = ast3.sections[0].lines[0].units[1];
    expect(u3.segments).toHaveLength(2);
    expect(spliceMelodyPitch(m3, u3, "1'")).toBe(`<key> C\n<time> 4/4\n| [31']=~[1'6]_ 2_ 3 4 |`);

    // 4. Duration + rest ('0') edit on mixed bracket+tie units preserves neighbor's outer tie
    const mRestRight = `<key> C\n<time> 4/4\n| 3_~[31]=~1_ 2_ 3 - |`;
    const astRestRight = parseClassicSong(mRestRight, `<tag> 主歌\n一二三四`);
    expect(astRestRight.errors).toBeUndefined();
    const uRight0 = astRestRight.sections[0].lines[0].units[0]; // 3_~3=
    expect(modifyMelodicUnitDuration(mRestRight, uRight0, 0.5, '0')).toBe(
      `<key> C\n<time> 4/4\n| 0_ 1=~1_ 2_ 3 - |`
    );
    const updatedRightSameDur = modifyMelodicUnitDuration(mRestRight, uRight0, 0.75, '0');
    expect(updatedRightSameDur).toBe(`<key> C\n<time> 4/4\n| 0_ [01]=~1_ 2_ 3 - |`);
    expect(parseClassicSong(updatedRightSameDur, `<tag> 主歌\n一二三`).errors).toBeUndefined();

    const mRestLeft = `<key> C\n<time> 4/4\n| 3_ ~[31]=~1_ 2_ 3 - |`;
    const astRestLeft = parseClassicSong(mRestLeft, `<tag> 主歌\n一二三四`);
    expect(astRestLeft.errors).toBeUndefined();
    const uLeft1 = astRestLeft.sections[0].lines[0].units[1]; // 1=~1_
    expect(modifyMelodicUnitDuration(mRestLeft, uLeft1, 0.5, '0')).toBe(
      `<key> C\n<time> 4/4\n| 3_ ~3= 0_ 2_ 3 - |`
    );
    const updatedLeftSameDur = modifyMelodicUnitDuration(mRestLeft, uLeft1, 0.75, '0');
    expect(updatedLeftSameDur).toBe(`<key> C\n<time> 4/4\n| 3_ ~[30]= 0_ 2_ 3 - |`);
    expect(parseClassicSong(updatedLeftSameDur, `<tag> 主歌\n一二三`).errors).toBeUndefined();
  });

  it('deduplicates shared pitchSpan on hyphen-mode split notes and handles courtesy-natural / rest edits', () => {
    // 1. hyphen=16 single source token split internally into multiple segments
    const hyphenMelody = `<key> C\n<time> 4/4 hyphen=16\n| 3--- 1----- 2--- 5----- |`;
    const hyphenLyrics = `<tag> 主歌\n一二三四`;
    const hyphenAst = parseClassicSong(hyphenMelody, hyphenLyrics);
    expect(hyphenAst.errors).toBeUndefined();
    const hyphenUnit = hyphenAst.sections[0].lines[0].units[1];
    expect(hyphenUnit.segments.length).toBeGreaterThan(1);
    const hyphenUpdated = spliceMelodyPitch(hyphenMelody, hyphenUnit, "1'");
    expect(hyphenUpdated).toBe(`<key> C\n<time> 4/4 hyphen=16\n| 3--- 1'----- 2--- 5----- |`);
    expect(parseClassicSong(hyphenUpdated, hyphenLyrics).errors).toBeUndefined();

    // 2. Courtesy natural tie: 1~%1 -> 2~2
    const natMelody = `<key> C\n<time> 4/4\n| 1~%1 3 4 |`;
    const natLyrics = `<tag> 主歌\n一二三`;
    const natAst = parseClassicSong(natMelody, natLyrics);
    expect(natAst.errors).toBeUndefined();
    const natUpdated = spliceMelodyPitch(natMelody, natAst.sections[0].lines[0].units[0], '2');
    expect(natUpdated).toBe(`<key> C\n<time> 4/4\n| 2~2 3 4 |`);
    expect(parseClassicSong(natUpdated, natLyrics).errors).toBeUndefined();

    // 3. Editing a tied unit's pitch to rest '0' removes '~' ties while preserving segment durations
    const restIntra = `<key> C\n<time> 4/4\n3_2_3_1=1=~1_6.`;
    const restIntraAst = parseClassicSong(restIntra, `<tag> 主歌\n甲乙丙丁戊~`);
    const restIntraUpdated = spliceMelodyPitch(
      restIntra,
      restIntraAst.sections[0].lines[0].units[4],
      '0'
    );
    expect(restIntraUpdated).toBe(`<key> C\n<time> 4/4\n3_2_3_1=0= 0_6.`);
    expect(parseClassicSong(restIntraUpdated, `<tag> 主歌\n甲乙丙丁戊`).errors).toBeUndefined();

    // Dangling source '~' on a 1-segment unit is also stripped when edited to rest '0'
    const danglingTie = `<key> C\n<time> 4/4\n| 1~ 2 3 4 |`;
    const danglingAst = parseClassicSong(danglingTie, `<tag> 主歌\n一二三四`);
    expect(
      spliceMelodyPitch(danglingTie, danglingAst.sections[0].lines[0].units[0], '0')
    ).toBe(`<key> C\n<time> 4/4\n| 0 2 3 4 |`);

    const restCross = `<key> C\n<time> 4/4\n| 1 2 3 - ~ | 3_ 4_ 5 6 |`;
    const restCrossAst = parseClassicSong(restCross, `<tag> 主歌\n一二三四五六`);
    const restCrossUpdated = spliceMelodyPitch(
      restCross,
      restCrossAst.sections[0].lines[0].units[2],
      '0'
    );
    expect(restCrossUpdated).toBe(`<key> C\n<time> 4/4\n| 1 2 0 - | 0_ 4_ 5 6 |`);
    expect(parseClassicSong(restCrossUpdated, `<tag> 主歌\n一二三四五`).errors).toBeUndefined();
  });
});

describe('Metric Subdivision, Cross-Measure Overflow & Invariance', () => {
  it('modifies last note of pickup bar bracket to longer duration cleanly', () => {
    const melody = `<key> C\n<time> 4/4\n[555]_ | 1 2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F G`;
    const ast = parseClassicSong(melody, lyrics);
    const unit = ast.sections[0].lines[0].units[2]; // last 5_ in [555]_
    expect(unit.duration.toNumber()).toBe(0.5);

    const updated = modifyMelodicUnitDuration(melody, unit, 3.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n[55]_ 5 - - | 1 2 3 4 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('decomposes bracket note across barline without injecting barline and preserves downstream bracket', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3_ [556]_ 1 2 [3344]_ |`;
    const lyrics = `<tag> Verse 1\nA B C D E F G H I J K L`;
    const ast = parseClassicSong(melody, lyrics);

    const unit = ast.sections[0].lines[0].units[5]; // note F (pitch 6, last note in [556]_)
    expect(unit.pitch.name).toBe(6);
    expect(unit.duration.toNumber()).toBe(0.5);

    // Lengthen from 0.5 to 1.5 beats: 0.5 beat in Bar 1 (6_ ~) + 1.0 beat in Bar 2 (6)
    const updated = modifyMelodicUnitDuration(melody, unit, 1.5);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3_ [55]_ 6_ ~ 6 1 2 [3344]_ |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('decomposes single unbracketed note across barline without injecting barline', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 6 4_ 5_ 1 2 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F G H`;
    const ast = parseClassicSong(melody, lyrics);

    const unit = ast.sections[0].lines[0].units[3]; // note D (pitch 6)
    expect(unit.pitch.name).toBe(6);
    expect(unit.duration.toNumber()).toBe(1.0);

    // Lengthen from 1.0 to 1.5 beats: 1.0 beat in Bar 1 (6 ~) + 0.5 beat in Bar 2 (6_)
    const updated = modifyMelodicUnitDuration(melody, unit, 1.5);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3 6 ~ 6_ 4_ 5_ 1 2 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('preserves existing barline when note decomposes across explicit barline', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3 6 | 4_ 5_ 1 2 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F G H`;
    const ast = parseClassicSong(melody, lyrics);

    const unit = ast.sections[0].lines[0].units[3]; // note D (pitch 6)
    const updated = modifyMelodicUnitDuration(melody, unit, 1.5);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3 6 ~ | 6_ 4_ 5_ 1 2 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('decomposes note spanning 3 full measures chaining ties across multiple barlines', () => {
    const melody = `<key> C\n<time> 4/4\n| 1 2 3_ [556]_ 4_ 1 2 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F G H I`;
    const ast = parseClassicSong(melody, lyrics);

    const unit = ast.sections[0].lines[0].units[5]; // note F (pitch 6)
    // Lengthen from 0.5 to 5.0 beats (0.5 in Bar 1, 4.0 in Bar 2, 0.5 in Bar 3)
    const updated = modifyMelodicUnitDuration(melody, unit, 5.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 2 3_ [55]_ 6_ ~ 6 - - - ~ 6_ 4_ 1 2 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('decomposes note across barline in 3/4 meter', () => {
    const melody = `<key> C\n<time> 3/4\n| 1 2 6 5_ 4_ 3 |`;
    const lyrics = `<tag> Verse 1\nA B C D E F`;
    const ast = parseClassicSong(melody, lyrics);

    const unit = ast.sections[0].lines[0].units[2]; // note C (pitch 6)
    // Beat 2.0 in 3/4 lengthened from 1.0 to 2.0 beats (1.0 in Bar 1, 1.0 in Bar 2)
    const updated = modifyMelodicUnitDuration(melody, unit, 2.0);
    expect(updated).toBe(`<key> C\n<time> 3/4\n| 1 2 6 ~ 6 5_ 4_ 3 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('preserves downstream comments, line breaks, and other lines byte-for-byte identically', () => {
    const melody = `// Header intro comment
<key> C
<time> 4/4

| 1 2 3 4 |
// Verse marker
| 5 6 7 1' |
`;
    const lyrics = `<tag> Verse 1
A B C D
E F G H
`;
    const ast = parseClassicSong(melody, lyrics);
    const unit = ast.sections[0].lines[0].units[1]; // note 2

    const updated = modifyMelodicUnitDuration(melody, unit, 2.0);
    const downstreamMarker = '// Verse marker';
    expect(updated.slice(updated.indexOf(downstreamMarker))).toBe(
      melody.slice(melody.indexOf(downstreamMarker))
    );
  });
});
