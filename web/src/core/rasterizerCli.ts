import { Resvg } from '@resvg/resvg-js';

/**
 * Rasterizes an SVG string into a high-DPI PNG Buffer using Resvg (Rust-based headless renderer).
 */
export function rasterizeSvgToPngBuffer(svgString: string, targetWidth: number = 2048): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: targetWidth,
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}
