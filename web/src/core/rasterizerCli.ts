import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves bundled music font files (`times.ttf`, `timesbd.ttf`, internal family `'Times New Roman'`)
 * for headless CLI rasterization. Note: `kaiu.ttf` is intentionally NOT passed to `Resvg` because
 * Windows `kaiu.ttf` relies on TrueType bytecode hinting instructions to position compound CJK
 * glyph components, which Rust `ttf-parser`/`resvg` does not execute.
 */
function resolveBundledMusicFontFiles(): string[] {
  const candidates = [
    path.resolve(__dirname, '../../../latex/fonts'),
    path.resolve(__dirname, '../../public/fonts'),
  ];
  for (const dir of candidates) {
    const regular = path.join(dir, 'times.ttf');
    const bold = path.join(dir, 'timesbd.ttf');
    const found = [regular, bold].filter((p) => fs.existsSync(p));
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

const CLI_MUSIC_FONT_FILES = resolveBundledMusicFontFiles();

/**
 * Rasterizes an SVG string into a high-DPI PNG Buffer using Resvg (Rust-based headless renderer).
 */
export function rasterizeSvgToPngBuffer(svgString: string, targetWidth: number = 2048): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: targetWidth,
    },
    ...(CLI_MUSIC_FONT_FILES.length > 0
      ? {
          font: {
            loadSystemFonts: true,
            fontFiles: CLI_MUSIC_FONT_FILES,
          },
        }
      : {}),
  });
  const pngData = resvg.render();
  return pngData.asPng();
}
