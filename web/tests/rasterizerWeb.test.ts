import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  arrayBufferToBase64,
  embedFontCssInSvg,
  isValidFontBinary,
  loadEmbeddedFontCss,
  loadLyricFontCss,
  resetLyricFontCssCacheForTests,
} from '../src/core/rasterizerWeb';
import { parseClassicSong } from '../src/core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from '../src/core/svgRenderer';

describe('rasterizerWeb embedded lyric and music fonts', () => {
  const fontsDir = path.resolve(__dirname, '../../latex/fonts');
  const kaiuPath = path.join(fontsDir, 'kaiu.ttf');
  const timesPath = path.join(fontsDir, 'times.ttf');
  const timesBdPath = path.join(fontsDir, 'timesbd.ttf');

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

  it('validates real kaiu.ttf, times.ttf, and timesbd.ttf binary headers and rejects HTML SPA fallback responses', () => {
    for (const p of [kaiuPath, timesPath, timesBdPath]) {
      const header = new Uint8Array(fs.readFileSync(p).subarray(0, 16));
      expect(isValidFontBinary(header)).toBe(true);
    }

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

  it('embeds DFKai-SB alongside regular and bold NMNMusic fonts and caches per font', async () => {
    const sampleTtf = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xca, 0xfe, 0xba, 0xbe]);
    const requestedUrls: string[] = [];

    const mockFetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        arrayBuffer: async () => sampleTtf.buffer.slice(0),
      } as Response;
    }) as unknown as typeof fetch;

    const css1 = await loadEmbeddedFontCss(mockFetch);
    const css2 = await loadEmbeddedFontCss(mockFetch);
    expect(requestedUrls).toEqual([
      './fonts/kaiu.ttf',
      './fonts/times.ttf',
      './fonts/timesbd.ttf',
    ]);
    expect(css1).toContain("font-family: 'DFKai-SB'");
    expect(css1).toContain("font-family: 'NMNMusic'");
    expect(css1).toContain('font-weight: 400;');
    expect(css1).toContain('font-weight: 700;');
    expect(css2).toBe(css1);
  });
});
