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

1 2 3 4
`;
    const lyrics = `<tag> 主歌
一~二三
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

  it('ensures nested slur over tie on Line 2 does not overlap Line 1 lyrics', () => {
    const melody = `<key> C
<time> 4/4

3_2_3_5_ 5_5_6_5_
3_2_3_1'=1'=~1'_6.
`;
    const lyrics = `<tag> 主歌
一二三四五六七八
甲乙丙丁戊~
`;
    const ast = parseClassicSong(melody, lyrics);
    const slides = splitAstIntoSlides(ast.sections);
    expect(slides).toHaveLength(1);

    const slideSvg = renderer.renderSlide(slides[0]);
    const transforms = [...slideSvg.matchAll(/transform="translate\(([\d.-]+),\s*([\d.-]+)\)"/g)];
    expect(transforms).toHaveLength(2);
    const line1Y = parseFloat(transforms[0][2]);
    const line2Y = parseFloat(transforms[1][2]);

    // Determine bottom of Line 1 lyric glyphs from rendered Line 1 SVG
    const line1Render = renderer.renderLine(slides[0].line1);
    const lyricTextMatch = line1Render.svg.match(
      /<text x="[\d.-]+" y="([\d.-]+)"[^>]*font-size="([\d.-]+)"[^>]*>一<\/text>/
    );
    expect(lyricTextMatch).not.toBeNull();
    const lyricRelY = parseFloat(lyricTextMatch![1]);
    const lyricFontSize = parseFloat(lyricTextMatch![2]);
    // CJK glyph descenders extend at most ~0.2 * fontSize below baseline
    const line1LyricBottom = line1Y + lyricRelY + lyricFontSize * 0.2;

    const line2Render = renderer.renderLine(slides[0].line2!);
    const paths = [
      ...line2Render.svg.matchAll(
        /<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"[^>]*stroke-width="([\d.-]+)"/g
      ),
    ];
    // Tie [4, 5] and outer slur [4, 6]
    expect(paths).toHaveLength(2);

    const tieStartY = parseFloat(paths[0][2]);
    const tieCtrlY = parseFloat(paths[0][4]);
    const tieStrokeW = parseFloat(paths[0][9]);
    const tiePeakY = tieStartY + 0.75 * (tieCtrlY - tieStartY);

    const slurStartY = parseFloat(paths[1][2]);
    const slurCtrlY = parseFloat(paths[1][4]);
    const slurStrokeW = parseFloat(paths[1][9]);
    const slurPeakY = slurStartY + 0.75 * (slurCtrlY - slurStartY);

    // Outer slur must sit cleanly above the tie without colliding
    expect(slurStartY + slurStrokeW / 2).toBeLessThan(tieStartY - tieStrokeW / 2);
    expect(slurPeakY + slurStrokeW / 2).toBeLessThan(tiePeakY - tieStrokeW / 2);

    // Nested slur stroke top on Line 2 must not overlap Line 1 lyric text
    const line2SlurTop = line2Y + slurPeakY - slurStrokeW / 2;
    expect(line2SlurTop).toBeGreaterThan(line1LyricBottom);
  });

  it('raises slurs above interior high-octave notes and double-high octave dots', () => {
    const melody = `<key> C
<time> 4/4

6_ 1'_ 6_ 5_ 1''_ 2''_ 3_ 2_
`;
    const lyrics = `<tag> 主歌
一~~二~三四
`;
    const ast = parseClassicSong(melody, lyrics);
    const line = ast.sections[0].lines[0];
    const rendered = renderer.renderLine(line);

    const circles = [
      ...rendered.svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g),
    ].map((m) => ({
      cy: parseFloat(m[2]),
      r: parseFloat(m[3]),
    }));
    // Octave dots sit above note cap-height (cy < -70)
    const octaveDots = circles.filter((c) => c.cy < -70);
    const singleOctaveDotTop = Math.max(...octaveDots.map((d) => d.cy)) - octaveDots[0].r;
    const doubleOctaveDotTop = Math.min(...octaveDots.map((d) => d.cy)) - octaveDots[0].r;

    const paths = [
      ...rendered.svg.matchAll(
        /<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"/g
      ),
    ];
    expect(paths).toHaveLength(2);

    // First slur spans 6_ 1'_ 6_ and must start above the interior single-octave dot
    const interiorOctaveStartY = parseFloat(paths[0][2]);
    expect(interiorOctaveStartY).toBeLessThan(singleOctaveDotTop);

    // Second slur spans 1''_ 2''_ and must start above the second octave dot
    const doubleOctaveStartY = parseFloat(paths[1][2]);
    expect(doubleOctaveStartY).toBeLessThan(doubleOctaveDotTop);
  });

  it('keeps an outer melismatic slur strictly above an off-center cross-barline inner tie', () => {
    const melody = `<key> C
<time> 2/4

6_ 5_~ | 5_ 3_ | 1_ 2_ 3_ 5_ | 6_ 5_ 3_ 2_
`;
    const lyrics = `<tag> 主歌
一~~~~~~~~~~
`;
    const ast = parseClassicSong(melody, lyrics);
    const line = ast.sections[0].lines[0];
    const rendered = renderer.renderLine(line);

    const paths = [
      ...rendered.svg.matchAll(
        /<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"[^>]*stroke-width="([\d.-]+)"/g
      ),
    ];
    // Tie [1, 2] across first barline and outer slur [0, 12]
    expect(paths).toHaveLength(2);

    const evalBezier = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    };

    const [, tx0s, ty0s, tcx1s, tcy1s, tcx2s, , tx3s, , tSwS] = paths[0];
    const txMid = evalBezier(+tx0s, +tcx1s, +tcx2s, +tx3s, 0.5);
    const tyPeak = evalBezier(+ty0s, +tcy1s, +tcy1s, +ty0s, 0.5);
    const tieStrokeTop = tyPeak - +tSwS / 2;

    const [, sx0s, sy0s, scx1s, scy1s, scx2s, scy2s, sx3s, sy3s, sSwS] = paths[1];
    // Find t on outer slur corresponding to txMid
    let lo = 0;
    let hi = 1;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      if (evalBezier(+sx0s, +scx1s, +scx2s, +sx3s, mid) < txMid) lo = mid;
      else hi = mid;
    }
    const tAtTieMid = (lo + hi) / 2;
    const slurYAtTieMid = evalBezier(+sy0s, +scy1s, +scy2s, +sy3s, tAtTieMid);
    const slurStrokeBottom = slurYAtTieMid + +sSwS / 2;

    // Outer slur bottom edge must stay strictly above (more negative than) inner tie top edge
    expect(slurStrokeBottom).toBeLessThan(tieStrokeTop);
  });

  it('renders Slide 1 Title card matching template.pptx fonts and font sizes', () => {
    const titleSvg = SvgRenderer.renderTitleSlideSvg();
    expect(titleSvg).toContain('viewBox="0 0 1024 768"');
    // Album: 54pt -> 76px, bold 標楷體, yellow
    expect(titleSvg).toContain('font-size="76"');
    expect(titleSvg).toContain('font-weight="bold"');
    expect(titleSvg).toContain('fill="#ffff00"');
    expect(titleSvg).toContain('>專輯<');

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

  it('renders Slide 1 Title card with customized SongMetadata', () => {
    const titleSvg = SvgRenderer.renderTitleSlideSvg({
      title: '不動搖的信心',
      subtitle: 'Unshakeable Faith',
      album: '讚美之泉 22',
      credits: '詞：游智婷 / 曲：曾祥怡',
    });
    expect(titleSvg).toContain('>不動搖的信心<');
    expect(titleSvg).toContain('>Unshakeable Faith<');
    expect(titleSvg).toContain('>讚美之泉 22<');
    expect(titleSvg).toContain('>詞：游智婷 / 曲：曾祥怡<');
  });

  it('renders 2-line title with Shift+Enter or \\n and auto-adjusts layout', async () => {
    const { calculateTitleLayout, splitTitleLines } = await import('../src/core/svgRenderer');

    expect(splitTitleLines('一生一世\\n在主的殿中')).toEqual(['一生一世', '在主的殿中']);
    expect(splitTitleLines('一生一世\n在主的殿中')).toEqual(['一生一世', '在主的殿中']);

    const layout = calculateTitleLayout('一生一世\\n在主的殿中');
    expect(layout.lines).toEqual(['一生一世', '在主的殿中']);
    expect(layout.fontSize).toBe(105);
    expect(layout.lineYCoords).toEqual([305, 425]);
    expect(layout.subtitleY).toBe(545);

    const titleSvg = SvgRenderer.renderTitleSlideSvg({
      title: '一生一世\\n在主的殿中',
      subtitle: 'All the Days of My Life',
    });
    expect(titleSvg).toContain('y="305"');
    expect(titleSvg).toContain('>一生一世<');
    expect(titleSvg).toContain('y="425"');
    expect(titleSvg).toContain('>在主的殿中<');
    expect(titleSvg).toContain('y="545"');
    expect(titleSvg).toContain('>All the Days of My Life<');
  });

  it('auto-scales font size down for long single-line titles', async () => {
    const { calculateTitleLayout } = await import('../src/core/svgRenderer');

    // 10 CJK characters: 10 units -> 880 / 10 = 88px
    const layout10 = calculateTitleLayout('我們要在主裡堅定不移');
    expect(layout10.lines).toHaveLength(1);
    expect(layout10.fontSize).toBe(88);

    const titleSvg10 = SvgRenderer.renderTitleSlideSvg({
      title: '我們要在主裡堅定不移',
    });
    expect(titleSvg10).toContain('font-size="88"');

    // 12 CJK characters: 12 units -> 880 / 12 = 73.3px -> clamped to min 75px
    const layout12 = calculateTitleLayout('我們要在主裡永遠堅定不移');
    expect(layout12.fontSize).toBe(75);
  });

  it('renders 2-line subtitle with Shift+Enter or \\n and auto-adjusts layout', async () => {
    const { calculateSubtitleLayout, splitSubtitleLines } = await import('../src/core/svgRenderer');

    expect(splitSubtitleLines('All the Days of My Life\\nIn the House of the Lord')).toEqual([
      'All the Days of My Life',
      'In the House of the Lord',
    ]);

    const subLayout = calculateSubtitleLayout(
      'All the Days of My Life\\nIn the House of the Lord',
      false
    );
    expect(subLayout.lines).toHaveLength(2);
    expect(subLayout.fontSize).toBe(48);
    expect(subLayout.lineYCoords).toEqual([500, 557]);

    const titleSvg = SvgRenderer.renderTitleSlideSvg({
      title: '一生一世',
      subtitle: 'All the Days of My Life\\nIn the House of the Lord',
    });
    expect(titleSvg).toContain('y="500"');
    expect(titleSvg).toContain('>All the Days of My Life<');
    expect(titleSvg).toContain('y="557"');
    expect(titleSvg).toContain('>In the House of the Lord<');
  });

  it('preserves empty trailing line when preserveEmpty is true for active typing', async () => {
    const {
      calculateTitleLayout,
      splitTitleLines,
      calculateSubtitleLayout,
      splitSubtitleLines,
    } = await import('../src/core/svgRenderer');

    // Title: trailing newline after Shift+Enter
    expect(splitTitleLines('一生一世\n', true)).toEqual(['一生一世', '']);
    const titleLayout = calculateTitleLayout('一生一世\n', true);
    expect(titleLayout.lines).toHaveLength(2);
    expect(titleLayout.fontSize).toBe(105);
    expect(titleLayout.lineYCoords).toEqual([305, 425]);

    // Subtitle: trailing newline after Shift+Enter
    expect(splitSubtitleLines('All the Days of My Life\n', true)).toEqual([
      'All the Days of My Life',
      '',
    ]);
    const subLayout = calculateSubtitleLayout('All the Days of My Life\n', false, true);
    expect(subLayout.lines).toHaveLength(2);
    expect(subLayout.fontSize).toBe(48);

    // Credits: trailing newline after Shift+Enter
    const { calculateCreditsLayout, splitCreditsLines } = await import('../src/core/svgRenderer');
    expect(splitCreditsLines('詞：王小明、陳大華\n', true)).toEqual([
      '詞：王小明、陳大華',
      '',
    ]);
    const credLayout = calculateCreditsLayout('詞：王小明、陳大華\n', true);
    expect(credLayout.lines).toHaveLength(2);
    expect(credLayout.fontSize).toBe(48);
  });

  it('supports explicit 2-line credits and auto-shrinks long single-line credits without splitting on slash', async () => {
    const { calculateCreditsLayout, splitCreditsLines } = await import('../src/core/svgRenderer');

    // Long single-line credits with ／ stays on 1 line and shrinks font to fit 880px
    const singleLong = '詞：王小明、陳大華 ／ 曲：王小明、林志明';
    expect(splitCreditsLines(singleLong)).toEqual([singleLong]);
    const singleLayout = calculateCreditsLayout(singleLong);
    expect(singleLayout.lines).toHaveLength(1);
    expect(singleLayout.fontSize).toBe(44);
    expect(singleLayout.lineYCoords).toEqual([682]);

    // Explicit 2-line credits via \n or \\n
    expect(splitCreditsLines('詞：王小明、陳大華\\n曲：王小明、林志明')).toEqual([
      '詞：王小明、陳大華',
      '曲：王小明、林志明',
    ]);
    expect(splitCreditsLines('詞：王小明、陳大華\n曲：王小明、林志明')).toEqual([
      '詞：王小明、陳大華',
      '曲：王小明、林志明',
    ]);

    const twoLineLayout = calculateCreditsLayout('詞：王小明、陳大華\\n曲：王小明、林志明');
    expect(twoLineLayout.lines).toHaveLength(2);
    expect(twoLineLayout.fontSize).toBe(48);
    expect(twoLineLayout.lineYCoords).toEqual([648, 706]);

    const titleSvg = SvgRenderer.renderTitleSlideSvg({
      title: '範例標題',
      credits: '詞：王小明、陳大華\\n曲：王小明、林志明',
    });
    expect(titleSvg).toContain('y="648"');
    expect(titleSvg).toContain('>詞：王小明、陳大華<');
    expect(titleSvg).toContain('y="706"');
    expect(titleSvg).toContain('>曲：王小明、林志明<');
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

  it('locks note digits to bundled NMNMusic font and renders sharp/flat/natural as deterministic SVG paths', () => {
    expect(SvgRenderer.MUSIC_FONT.startsWith("'NMNMusic'")).toBe(true);

    // In <key> G (1# on F), #1 is sharp, $7 is flat, and %4 (F natural -> $7 in solfa; %1 -> courtesy natural)
    const melody = `<key> C\n<time> 4/4\n| #4 $7 %1 5 |`;
    const lyrics = `<tag> 主歌\n一二三四`;
    const ast = parseClassicSong(melody, lyrics);
    expect(ast.errors).toBeUndefined();

    const lineSvg = renderer.renderLine(ast.sections[0].lines[0]).svg;
    expect(lineSvg).toContain(`font-family="${SvgRenderer.MUSIC_FONT}"`);
    expect(lineSvg).toContain('data-accidental="sharp"');
    expect(lineSvg).toContain('data-accidental="flat"');
    expect(lineSvg).toContain('data-accidental="natural"');
    expect(lineSvg).not.toMatch(/[♯♭♮]/);
  });
});

