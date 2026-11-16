import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  arrayBufferToBase64,
  embedFontCssInSvg,
  isValidFontBinary,
  loadLyricFontCss,
  resetLyricFontCssCacheForTests,
} from '../src/core/rasterizerWeb';
import { parseClassicSong } from '../src/core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from '../src/core/svgRenderer';

describe('rasterizerWeb embedded lyric font', () => {
  const kaiuPath = path.resolve(__dirname, '../../latex/fonts/kaiu.ttf');

  beforeEach(() => {
    resetLyricFontCssCacheForTests();
  });

  it('encodes multi-chunk (>64 KiB) ArrayBuffers to Base64 without call-stack overflow', () => {
    const size = 100_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = (i * 31 + 7) & 0xff;
    }

    const b64 = arrayBufferToBase64(bytes.buffer);
    const decoded = Uint8Array.from(Buffer.from(b64, 'base64'));
    expect(decoded.length).toBe(size);
    expect(decoded).toEqual(bytes);
  });

  it('validates real kaiu.ttf binary headers and rejects HTML SPA fallback responses', () => {
    const kaiuHeader = new Uint8Array(fs.readFileSync(kaiuPath).subarray(0, 16));
    expect(isValidFontBinary(kaiuHeader)).toBe(true);

    const htmlFallback = new TextEncoder().encode('<!doctype html><html></html>');
    expect(isValidFontBinary(htmlFallback)).toBe(false);
    expect(isValidFontBinary(new Uint8Array([0x00, 0x01]))).toBe(false);
  });

  it('fetches kaiu.ttf once, caches data URI CSS, and resets cache on transient failure', async () => {
    const sampleTtf = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    let calls = 0;

    const failingThenWorkingFetch = (async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response;
      }
      return {
        ok: true,
        arrayBuffer: async () => sampleTtf.buffer.slice(0),
      } as Response;
    }) as unknown as typeof fetch;

    // First attempt fails -> returns empty CSS and clears cache
    const css1 = await loadLyricFontCss(failingThenWorkingFetch);
    expect(css1).toBe('');
    expect(calls).toBe(1);

    // Retry succeeds and caches result across subsequent calls
    const css2 = await loadLyricFontCss(failingThenWorkingFetch);
    const css3 = await loadLyricFontCss(failingThenWorkingFetch);
    expect(calls).toBe(2);
    expect(css2).toContain("font-family: 'DFKai-SB'");
    expect(css2).toContain('data:font/ttf;base64,');
    expect(css3).toBe(css2);

    const ast = parseClassicSong('<key> C\n<time> 4/4\n1 2 3 4\n', '<tag> 主歌\n黑暗光明\n');
    const slides = splitAstIntoSlides(ast.sections);
    const svg = new SvgRenderer().renderSlide(slides[0]);
    const embedded = embedFontCssInSvg(svg, css2);
    expect(embedded).toContain('<defs><style>@font-face');
    expect(embedded).toContain('lang="zh-TW"');
  });
});
