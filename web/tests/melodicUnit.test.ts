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

  it('handles Choice A: separates 1~2 into TWO MelodicUnits connected by a slur', () => {
    const melody = `<key> C\n<time> 4/4\n| 1~2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C`;
    const ast = parseClassicSong(melody, lyrics);

    const line = ast.sections[0].lines[0];
    // 1 and 2 have different pitches -> Choice A creates 2 distinct MelodicUnits
    expect(line.units).toHaveLength(4);

    const unit1 = line.units[0];
    expect(unit1.pitch.name).toBe(1);
    expect(unit1.duration.toNumber()).toBe(1.0);
    expect(unit1.lyric).toBe('A');
    expect(unit1.slurToNext).toBe(true);

    const unit2 = line.units[1];
    expect(unit2.pitch.name).toBe(2);
    expect(unit2.duration.toNumber()).toBe(1.0);
    expect(unit2.slurFromPrev).toBe(true);
    expect(unit2.lyric).toBeUndefined(); // Slur continuation has no new syllable

    const unit3 = line.units[2];
    expect(unit3.pitch.name).toBe(3);
    expect(unit3.lyric).toBe('B');

    const unit4 = line.units[3];
    expect(unit4.pitch.name).toBe(4);
    expect(unit4.lyric).toBe('C');
  });

  it('handles multi-note slur 1~2~3 creating 3 distinct MelodicUnits with single syllable', () => {
    const melody = `<key> C\n<time> 4/4\n| 1~2~3 4 |`;
    const lyrics = `<tag> Verse 1\nA B`;
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
  it('melodic slur head duration edit preserves outgoing slur tie: 1~2 -> 1 -~2', () => {
    const melody = `<key> C\n<time> 4/4\n| 1~2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C`;
    const ast = parseClassicSong(melody, lyrics);
    const unit0 = ast.sections[0].lines[0].units[0];

    const updated = modifyMelodicUnitDuration(melody, unit0, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1 -~2 3 4 |`);

    const newAst = parseClassicSong(updated, lyrics);
    expect(newAst.errors).toBeUndefined();
  });

  it('melodic slur tail duration edit preserves incoming slur tie without double tildes: 1~2 -> 1~2 -', () => {
    const melody = `<key> C\n<time> 4/4\n| 1~2 3 4 |`;
    const lyrics = `<tag> Verse 1\nA B C`;
    const ast = parseClassicSong(melody, lyrics);
    const unit1 = ast.sections[0].lines[0].units[1];

    const updated = modifyMelodicUnitDuration(melody, unit1, 2.0);
    expect(updated).toBe(`<key> C\n<time> 4/4\n| 1~2 - 3 4 |`);
    expect(updated).not.toContain('~~');

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
