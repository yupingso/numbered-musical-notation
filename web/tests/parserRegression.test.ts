import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parsePitch, parseTime, parseClassicSong, KeySignature } from '../src/core/parserClassic';
import { Note, Accidental } from '../src/core/types';

describe('parsePitch', () => {
  const pitchKeyDict: Record<string, number> = {
    A: 6,
    B: 7,
    C: 1,
    D: 2,
    E: 3,
    F: 4,
    G: 5,
  };

  function getKey(k: string): KeySignature {
    if (k === 'solfa') return 'solfa';
    const pitch = pitchKeyDict[k[0]];
    let tmp = 0;
    if (k.length > 1) {
      tmp = k[1] === '#' ? 1 : -1;
    }
    return [pitch, tmp];
  }

  const cases: Array<[string, string, Accidental | null, number, number]> = [
    ['solfa', '2', null, 2, 0],
    ['solfa', 'q', null, 1, 1],
    ['solfa', '9', null, 2, 1],
    ['solfa', 'b', null, 5, -1],
    ['solfa', '0', null, Note.REST, 0],
    ['solfa', 'o', null, Note.REST_AT_END, 0],
    ['solfa', 'O', null, Note.REST_TO_MATCH_LYRICS, 0],
    ['C', '0', null, Note.REST, 0],
    ['D', 'o', null, Note.REST_AT_END, 0],
    ['G', 'O', null, Note.REST_TO_MATCH_LYRICS, 0],
    ['C#', '1', null, 1, 0],
    ['Db', 'F', null, 3, 0],
    ['E', '%c', Accidental.Flat, 6, -1],
    ['A', '#d', Accidental.Sharp, 4, 0],
    ['A', 'b', null, 2, 1],
    ['A', '8', null, 3, 1],
  ];

  for (const [keyStr, s, expAcc, expName, expOct] of cases) {
    it(`should parse pitch ${s} in key ${keyStr}`, () => {
      const key = getKey(keyStr);
      const [acc, name, octave] = parsePitch(key, s);
      expect(acc).toBe(expAcc);
      expect(name).toBe(expName);
      expect(octave).toBe(expOct);
    });
  }
});

describe('parseTime', () => {
  it('parses valid time signatures', () => {
    expect(parseTime('4/4')).toEqual({ upper: 4, lower: 4, hyphen: undefined });
    expect(parseTime('6/8')).toEqual({ upper: 6, lower: 8, hyphen: undefined });
    expect(parseTime('?/4')).toEqual({ upper: 0, lower: 4, hyphen: undefined });
    expect(parseTime('4/4 hyphen=4')).toEqual({ upper: 4, lower: 4, hyphen: 4 });
    expect(parseTime('4/4 hyphen=8')).toEqual({ upper: 4, lower: 4, hyphen: 8 });
  });

  it('throws on invalid time signatures', () => {
    expect(() => parseTime('4/5')).toThrow();
    expect(() => parseTime('4/?')).toThrow();
    expect(() => parseTime('6/8 hyphen=4')).toThrow();
    expect(() => parseTime('4/4 hyphen=9')).toThrow();
  });
});

describe('parseClassicSong with real songs in repo', () => {
  const songsDir = path.resolve(__dirname, '../../songs');

  it('parses song01 with exact lines matching original python output', () => {
    const melodyText = fs.readFileSync(path.join(songsDir, 'song01/melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(songsDir, 'song01/lyrics.txt'), 'utf-8');
    const ast = parseClassicSong(melodyText, lyricsText);

    expect(ast.sections).toHaveLength(2);
    expect(ast.sections[0].tag).toBe('主歌');
    expect(ast.sections[1].tag).toBe('副歌');

    const s0Lines = ast.sections[0].lines.map((l) => l.nodes.map((n) => n.text).filter(Boolean).join(''));
    expect(s0Lines).toEqual([
      '主阿我神',
      '我每逢舉目觀看',
      '你手所造',
      '一切奇妙大工',
      '看見星宿',
      '又聽到隆隆雷聲',
      '你的大能',
      '遍滿了宇宙中',
    ]);

    const s1Lines = ast.sections[1].lines.map((l) => l.nodes.map((n) => n.text).filter(Boolean).join(''));
    expect(s1Lines).toEqual([
      '我靈歌唱',
      '讚美救主我神',
      '你真偉大',
      '何等偉大',
      '我靈歌唱',
      '讚美救主我神',
      '你真偉大',
      '何等偉大',
    ]);
  });

  // Batch test all songs available in songs/
  const songDirs = fs
    .readdirSync(songsDir)
    .filter((d) => d.startsWith('song') && fs.existsSync(path.join(songsDir, d, 'melody.txt')));

  for (const songDir of songDirs) {
    it(`parses ${songDir} without errors`, () => {
      const melodyText = fs.readFileSync(path.join(songsDir, songDir, 'melody.txt'), 'utf-8');
      const lyricsText = fs.readFileSync(path.join(songsDir, songDir, 'lyrics.txt'), 'utf-8');
      const ast = parseClassicSong(melodyText, lyricsText);
      expect(ast.sections.length).toBeGreaterThan(0);
      expect(ast.sections[0].lines.length).toBeGreaterThan(0);
    });
  }
});
