import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseClassicSong } from '../src/core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from '../src/core/svgRenderer';

describe('SvgRenderer', () => {
  const songsDir = path.resolve(__dirname, '../../songs');
  const renderer = new SvgRenderer();

  it('renders slides for song01 with correct 4:3 dimensions and tags', () => {
    const melodyText = fs.readFileSync(path.join(songsDir, 'song01/melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(songsDir, 'song01/lyrics.txt'), 'utf-8');
    const ast = parseClassicSong(melodyText, lyricsText);

    const slides = splitAstIntoSlides(ast.sections);
    // song01: Section 0 has 8 lines -> 4 slides. Section 1 has 8 lines -> 4 slides. Total = 8 slides!
    expect(slides).toHaveLength(8);

    // First slide has sectionTag "主歌"
    expect(slides[0].sectionTag).toBe('主歌');
    expect(slides[1].sectionTag).toBeNull();

    // Render slide 1 to SVG
    const svg1 = renderer.renderSlide(slides[0]);
    expect(svg1).toContain('viewBox="0 0 1024 768"');
    expect(svg1).toContain('&lt;主歌&gt;');
    expect(svg1).toContain('>主<');
    expect(svg1).toContain('>阿<');
    expect(svg1).toContain('>我<');
    expect(svg1).toContain('>神<');

    // Slide 5 is the first slide of Chorus (Section 1)
    expect(slides[4].sectionTag).toBe('副歌');
    const svg5 = renderer.renderSlide(slides[4]);
    expect(svg5).toContain('&lt;副歌&gt;');
    expect(svg5).toContain('>我<');
    expect(svg5).toContain('>靈<');
    expect(svg5).toContain('>歌<');
    expect(svg5).toContain('>唱<');
  });
});
