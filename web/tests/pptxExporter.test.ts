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
});
