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
    expect(svg1).toContain('>主歌<');
    expect(svg1).toContain('>主<');
    expect(svg1).toContain('>阿<');
    expect(svg1).toContain('>我<');
    expect(svg1).toContain('>神<');

    // Slide 5 is the first slide of Chorus (Section 1)
    expect(slides[4].sectionTag).toBe('副歌');
    const svg5 = renderer.renderSlide(slides[4]);
    expect(svg5).toContain('>副歌<');
    expect(svg5).toContain('>我<');
    expect(svg5).toContain('>靈<');
    expect(svg5).toContain('>歌<');
    expect(svg5).toContain('>唱<');
  });

  it('renders underlines snugly matching note bounds without overlapping separate groups', () => {
    const melody = `<key> C
<time> 4/4

[5 5 5 5]_
`;
    const lyrics = `<tag> 主歌
一二三四
`;
    const ast = parseClassicSong(melody, lyrics);
    const line = ast.sections[0].lines[0];
    const rendered = renderer.renderLine(line, 900);

    // Extract all underline elements
    const underlineMatches = [...rendered.svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#ffffff" stroke-width="[\d.]+" stroke-linecap="butt" \/>/g)];
    expect(underlineMatches.length).toBeGreaterThan(0);

    // Verify each underline length:
    // In 4/4, [5 5 5 5]_ groups notes into two pairs: [0, 1] and [2, 3].
    // Each group underline should span between the pair, and there must be a visible gap between group 1 and group 2.
    if (underlineMatches.length >= 2) {
      const u1End = parseFloat(underlineMatches[0][3]);
      const u2Start = parseFloat(underlineMatches[1][1]);
      // u2Start must be strictly greater than u1End with a gap of at least 20px
      expect(u2Start - u1End).toBeGreaterThan(20);
    }

    // Check lyrics font is bold 標楷體 with readable font-size
    expect(rendered.svg).toContain('DFKai-SB');
    expect(rendered.svg).toContain('標楷體');
    expect(rendered.svg).toMatch(/font-size="[\d.]+"/);
    expect(rendered.svg).toContain('font-weight="bold"');
  });

  it('renders slurs with TikZ-identical cubic Bézier curves (not quadratic) with min/max distance clamping', () => {
    const melody = `<key> C
<time> 4/4

1 2 3 4
5 6 7 1'
`;
    const lyrics = `<tag> 主歌
一~二三
四~~~
`;
    const ast = parseClassicSong(melody, lyrics);
    const lineShort = ast.sections[0].lines[0];
    const lineLong = ast.sections[0].lines[1];

    const renderedShort = renderer.renderLine(lineShort, 900);
    const renderedLong = renderer.renderLine(lineLong, 900);

    // Should use cubic Bézier 'C' instead of quadratic 'Q'
    const shortMatches = [...renderedShort.svg.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"/g)];
    expect(shortMatches.length).toBe(1);

    const longMatches = [...renderedLong.svg.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"/g)];
    expect(longMatches.length).toBe(1);

    // Short slur:
    const [, , sY, , sc1y] = shortMatches[0];
    const shortHeight = parseFloat(sY) - parseFloat(sc1y);
    // Min distance in TikZ is 4pt (~38px), deltaY = 38 * 0.7071 ≈ 26.9px
    expect(shortHeight).toBeGreaterThan(20);

    // Long slur:
    const [, , lY, , lc1y] = longMatches[0];
    const longHeight = parseFloat(lY) - parseFloat(lc1y);
    // Max distance in TikZ is 8pt (~76px), deltaY = 76 * 0.7071 ≈ 53.8px
    // The curve must be clamped and not exceed ~56px
    expect(longHeight).toBeLessThanOrEqual(56);
  });

  it('scales slur and curve vertical position dynamically based on noteFontSize', () => {
    const melody = `<key> C
<time> 4/4

1~2 3 4
`;
    const lyrics = `<tag> 主歌
一二三
`;
    const ast = parseClassicSong(melody, lyrics);
    const line = ast.sections[0].lines[0];

    const renderedSmall = renderer.renderLine(line, 900, 72);
    const renderedMedium = renderer.renderLine(line, 900, 86);
    const renderedLarge = renderer.renderLine(line, 900, 94);

    const getStartY = (svg: string) => {
      const match = svg.match(/<path d="M [\d.-]+ ([\d.-]+) C/);
      return match ? parseFloat(match[1]) : null;
    };

    const ySmall = getStartY(renderedSmall.svg);
    const yMedium = getStartY(renderedMedium.svg);
    const yLarge = getStartY(renderedLarge.svg);

    expect(ySmall).not.toBeNull();
    expect(yMedium).not.toBeNull();
    expect(yLarge).not.toBeNull();

    // In SVG, more negative Y means higher up.
    // When font size increases from 72 -> 86 -> 94, the slur starting Y must move higher up (strictly more negative)
    // to maintain clearance above the taller note digits.
    expect(yMedium!).toBeLessThan(ySmall!);
    expect(yLarge!).toBeLessThan(yMedium!);

    // All curves must maintain valid clearance above the baseline (-120px to -30px)
    expect(ySmall!).toBeLessThan(0);
    expect(ySmall!).toBeGreaterThan(-120);
    expect(yLarge!).toBeLessThan(0);
    expect(yLarge!).toBeGreaterThan(-120);
  });

  it('renders Slide 1 Title card matching template.pptx fonts and font sizes', () => {
    const titleSvg = SvgRenderer.renderTitleSlideSvg();
    expect(titleSvg).toContain('viewBox="0 0 1024 768"');
    // Series: 54pt -> 76px, bold 標楷體, yellow
    expect(titleSvg).toContain('font-size="76"');
    expect(titleSvg).toContain('font-weight="bold"');
    expect(titleSvg).toContain('fill="#ffff00"');
    expect(titleSvg).toContain('>讚美之泉 22<');

    // Title: 106pt -> 150px, bold 標楷體, gold
    expect(titleSvg).toContain('font-size="150"');
    expect(titleSvg).toContain('fill="#ffcc00"');
    expect(titleSvg).toContain('>標題<');

    // Subtitle: 48pt -> 68px, bold Times New Roman
    expect(titleSvg).toContain('font-size="68"');
    expect(titleSvg).toContain('>Title<');

    // Credits: 40pt -> 56px, regular 標楷體, white
    expect(titleSvg).toContain('font-size="56"');
    expect(titleSvg).toContain('font-weight="normal"');
    expect(titleSvg).toContain('fill="#ffffff"');
    expect(titleSvg).toContain('>詞： / 曲：<');
  });

  it('centers notation lines horizontally with balanced margins and vertical separation', () => {
    const melodyText = fs.readFileSync(path.join(songsDir, 'song01/melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(songsDir, 'song01/lyrics.txt'), 'utf-8');
    const ast = parseClassicSong(melodyText, lyricsText);
    const slides = splitAstIntoSlides(ast.sections);

    const svg = renderer.renderSlide(slides[0]);

    // Extract line translation transforms: translate(startX, lineY)
    const transforms = [...svg.matchAll(/transform="translate\(([\d.-]+),\s*([\d.-]+)\)"/g)];
    expect(transforms.length).toBe(2);

    const startX1 = parseFloat(transforms[0][1]);
    const line1Y = parseFloat(transforms[0][2]);
    const startX2 = parseFloat(transforms[1][1]);
    const line2Y = parseFloat(transforms[1][2]);

    // Both lines must be horizontally aligned to the same left margin
    expect(startX1).toBe(startX2);

    // Left margin must leave balanced room within the 1024-wide slide canvas
    expect(startX1).toBeGreaterThan(60);
    expect(startX1).toBeLessThan(160);

    // Line 1 should be positioned in the upper portion and Line 2 in the lower portion
    expect(line1Y).toBeGreaterThan(150);
    expect(line1Y).toBeLessThan(350);
    expect(line2Y).toBeGreaterThan(450);
    expect(line2Y).toBeLessThan(650);
    expect(line2Y - line1Y).toBeGreaterThan(250);

    // Section tag must be positioned near the top-left margin
    const tagMatch = svg.match(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>.*?<\/text>/);
    expect(tagMatch).not.toBeNull();
    const tagX = parseFloat(tagMatch![1]);
    const tagY = parseFloat(tagMatch![2]);
    expect(tagX).toBeGreaterThan(30);
    expect(tagX).toBeLessThan(80);
    expect(tagY).toBeGreaterThan(40);
    expect(tagY).toBeLessThan(100);
  });

  it('formats section tags with Times New Roman digits and CJK spacing matching XeLaTeX xeCJK', () => {
    // Pure CJK tag: <主歌>
    const tagPureCjk = SvgRenderer.formatSectionTag('主歌');
    expect(tagPureCjk).toContain(`font-family="${SvgRenderer.MUSIC_FONT}">&lt;`);
    expect(tagPureCjk).toContain(`font-family="${SvgRenderer.LYRIC_FONT}">主歌</tspan>`);
    expect(tagPureCjk).toContain(`font-family="${SvgRenderer.MUSIC_FONT}">&gt;`);

    // Tag with digits: <主歌1> -> digit '1' formatted in MUSIC_FONT ('Times New Roman') with inter-script space
    const tagWithDigit = SvgRenderer.formatSectionTag('主歌1');
    expect(tagWithDigit).toContain(`font-family="${SvgRenderer.LYRIC_FONT}">主歌</tspan>`);
    expect(tagWithDigit).toContain(`font-family="${SvgRenderer.MUSIC_FONT}"> 1&gt;</tspan>`);

    // Tag with space and digit: <主歌 2>
    const tagWithSpace = SvgRenderer.formatSectionTag('主歌 2');
    expect(tagWithSpace).toContain(`font-family="${SvgRenderer.LYRIC_FONT}">主歌</tspan>`);
    expect(tagWithSpace).toContain(`font-family="${SvgRenderer.MUSIC_FONT}"> 2&gt;</tspan>`);

    // Pure Latin tag: <Verse 1>
    const tagLatin = SvgRenderer.formatSectionTag('Verse 1');
    expect(tagLatin).toContain(`font-family="${SvgRenderer.MUSIC_FONT}">&lt;Verse 1&gt;</tspan>`);

    // Verify slide 1 of song44 renders <主歌 1> correctly with Times New Roman digit '1'
    const melodyText = fs.readFileSync(path.join(songsDir, 'song44/melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(songsDir, 'song44/lyrics.txt'), 'utf-8');
    const ast = parseClassicSong(melodyText, lyricsText);
    const slides = splitAstIntoSlides(ast.sections);

    expect(slides[0].sectionTag).toBe('主歌1');
    const svg44 = renderer.renderSlide(slides[0]);
    expect(svg44).toContain(`font-family="${SvgRenderer.MUSIC_FONT}">&lt;`);
    expect(svg44).toContain(`font-family="${SvgRenderer.LYRIC_FONT}">主歌</tspan>`);
    expect(svg44).toContain(`font-family="${SvgRenderer.MUSIC_FONT}"> 1&gt;</tspan>`);
  });
});

