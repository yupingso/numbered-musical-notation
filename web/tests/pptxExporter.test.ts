import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { parseClassicSong } from '../src/core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from '../src/core/svgRenderer';
import { rasterizeSvgToPngBuffer } from '../src/core/rasterizerCli';
import { appendSlidesToPptx } from '../src/core/pptxExporter';

describe('pptxExporter with template.pptx', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const templatePath = path.join(repoRoot, 'ppt/template.pptx');
  const song01Dir = path.join(repoRoot, 'songs/song01');

  it('successfully appends song01 slides to template.pptx', async () => {
    const templateData = fs.readFileSync(templatePath);
    const melodyText = fs.readFileSync(path.join(song01Dir, 'melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(song01Dir, 'lyrics.txt'), 'utf-8');

    const ast = parseClassicSong(melodyText, lyricsText);
    const slides = splitAstIntoSlides(ast.sections);
    const renderer = new SvgRenderer();

    const pngImages: Buffer[] = [];
    for (const slide of slides) {
      const svg = renderer.renderSlide(slide);
      const pngBuf = rasterizeSvgToPngBuffer(svg, 1024);
      pngImages.push(pngBuf);
    }

    expect(pngImages).toHaveLength(8);

    const outPptxUint8Array = await appendSlidesToPptx({
      templateData,
      slidePngImages: pngImages,
    });

    expect(outPptxUint8Array.length).toBeGreaterThan(50000);

    // Verify OpenXML package structure
    const zip = await JSZip.loadAsync(outPptxUint8Array);

    // Slide 1 (title slide) is preserved
    expect(zip.file('ppt/slides/slide1.xml')).not.toBeNull();

    // Slides 2 to 9 exist
    for (let i = 2; i <= 9; i++) {
      expect(zip.file(`ppt/slides/slide${i}.xml`)).not.toBeNull();
      expect(zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)).not.toBeNull();
    }

    // Media images exist
    for (let i = 1; i <= 8; i++) {
      const imgFile = zip.file(`ppt/media/image${i}.png`);
      expect(imgFile).not.toBeNull();
      const imgBytes = await imgFile!.async('uint8array');
      // Verify PNG magic header: 0x89, 'P', 'N', 'G'
      expect(imgBytes[0]).toBe(0x89);
      expect(imgBytes[1]).toBe(0x50);
      expect(imgBytes[2]).toBe(0x4e);
      expect(imgBytes[3]).toBe(0x47);
    }

    // Check presentation.xml contains all 9 slide IDs
    const presXml = await zip.file('ppt/presentation.xml')!.async('text');
    const slideMatches = presXml.match(/<p:sldId /g) || [];
    expect(slideMatches).toHaveLength(9);
  });

  it('renders Slide 1 as a full-bleed image when a title card is supplied', async () => {
    const templateData = fs.readFileSync(templatePath);
    const titleSvg = SvgRenderer.renderTitleSlideSvg({
      title: '不動搖的信心',
      subtitle: 'Unshakeable Faith',
      album: '讚美之泉 22',
      credits: '詞：游智婷 / 曲：曾祥怡',
    });
    const titlePng = rasterizeSvgToPngBuffer(titleSvg, 1024);

    const outPptxUint8Array = await appendSlidesToPptx({
      templateData,
      slidePngImages: [],
      titlePngImage: titlePng,
    });

    const zip = await JSZip.loadAsync(outPptxUint8Array);
    const slide1Xml = await zip.file('ppt/slides/slide1.xml')!.async('text');

    // Slide 1 is now a single picture covering the whole 4:3 slide.
    expect(slide1Xml).toContain('<p:pic>');
    expect(slide1Xml).toContain('<a:ext cx="9144000" cy="6858000"/>');
    expect(slide1Xml).toContain('r:embed="rId2"');

    // The hand-authored text shapes are gone, so no font substitution can
    // occur on the machine that opens the deck.
    expect(slide1Xml).not.toContain('<a:t>');
    expect(slide1Xml).not.toContain('標楷體');
    expect(slide1Xml).not.toContain('type="slidenum"');
  });

  it('wires Slide 1 to its own image part', async () => {
    const templateData = fs.readFileSync(templatePath);
    const titlePng = rasterizeSvgToPngBuffer(SvgRenderer.renderTitleSlideSvg(), 1024);

    const outPptxUint8Array = await appendSlidesToPptx({
      templateData,
      slidePngImages: [],
      titlePngImage: titlePng,
    });

    const zip = await JSZip.loadAsync(outPptxUint8Array);
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('text');
    expect(rels).toContain('Target="../media/image1.png"');
    expect(rels).toContain('Target="../slideLayouts/slideLayout1.xml"');

    const img = zip.file('ppt/media/image1.png');
    expect(img).not.toBeNull();
    const bytes = await img!.async('uint8array');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('gives the title card and the notation slides distinct images', async () => {
    const templateData = fs.readFileSync(templatePath);
    const titlePng = rasterizeSvgToPngBuffer(SvgRenderer.renderTitleSlideSvg(), 1024);
    const melodyText = fs.readFileSync(path.join(song01Dir, 'melody.txt'), 'utf-8');
    const lyricsText = fs.readFileSync(path.join(song01Dir, 'lyrics.txt'), 'utf-8');
    const ast = parseClassicSong(melodyText, lyricsText);
    const renderer = new SvgRenderer();
    const notationPng = rasterizeSvgToPngBuffer(
      renderer.renderSlide(splitAstIntoSlides(ast.sections)[0]),
      1024
    );

    const outPptxUint8Array = await appendSlidesToPptx({
      templateData,
      slidePngImages: [notationPng],
      titlePngImage: titlePng,
    });

    const zip = await JSZip.loadAsync(outPptxUint8Array);
    // The title card claims image1; the notation slide follows as image2.
    expect(await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('text')).toContain(
      'image1.png'
    );
    expect(await zip.file('ppt/slides/_rels/slide2.xml.rels')!.async('text')).toContain(
      'image2.png'
    );

    // Both slides share the same markup, differing only in their image.
    const slide1Xml = await zip.file('ppt/slides/slide1.xml')!.async('text');
    const slide2Xml = await zip.file('ppt/slides/slide2.xml')!.async('text');
    expect(slide1Xml).toEqual(slide2Xml);
  });

  it("leaves the template's Slide 1 untouched when no title card is supplied", async () => {
    const templateData = fs.readFileSync(templatePath);
    const outPptxUint8Array = await appendSlidesToPptx({
      templateData,
      slidePngImages: [],
    });

    const zip = await JSZip.loadAsync(outPptxUint8Array);
    const slide1Xml = await zip.file('ppt/slides/slide1.xml')!.async('text');
    expect(slide1Xml).toContain('<a:t>');
    expect(slide1Xml).not.toContain('<p:pic>');
  });
});
