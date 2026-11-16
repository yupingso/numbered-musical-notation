/**
 * Browser-native SVG-to-PNG rasterizer using HTML5 Canvas.
 *
 * Standalone SVGs loaded via `new Image()` (`<img src="blob:...">`) run in an
 * isolated browser document that cannot access page CSS (`@font-face` in
 * `index.css` or `document.fonts`) and blocks external URL fetches. To ensure
 * Traditional Chinese lyrics render with the bundled DFKai-SB (`kaiu.ttf`) font
 * on all OSes during `.pptx` export, we fetch `./fonts/kaiu.ttf` once, encode
 * it as a `data:font/ttf;base64,...` URI, and inline `<defs><style>...</style></defs>`
 * directly into the SVG before rasterizing.
 */

const BASE64_CHUNK_SIZE = 0x8000;

/**
 * Encodes an ArrayBuffer into Base64 in 32 KiB chunks without overflowing the call stack.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    let binary = '';
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
    chunks.push(binary);
  }
  return btoa(chunks.join(''));
}

/**
 * Verifies that fetched bytes start with a valid TrueType/OpenType/WOFF signature
 * (guarding against SPA dev-server `200 OK` HTML fallbacks if the font file is missing).
 */
export function isValidFontBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  // TrueType 1.0: 0x00 0x01 0x00 0x00
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return true;
  const tag = String.fromCharCode(b0, b1, b2, b3);
  return tag === 'OTTO' || tag === 'true' || tag === 'ttcf' || tag === 'wOFF' || tag === 'wOF2';
}

/**
 * Injects an inline `<defs><style>...</style></defs>` block immediately after the root `<svg>` tag.
 */
export function embedFontCssInSvg(svgString: string, fontCss: string): string {
  if (!fontCss) return svgString;
  return svgString.replace(
    /(<svg\b[^>]*>)/i,
    (match) => `${match}\n  <defs><style>${fontCss}</style></defs>`
  );
}

let cachedLyricFontCssPromise: Promise<string> | null = null;

export function resetLyricFontCssCacheForTests(): void {
  cachedLyricFontCssPromise = null;
}

export function loadLyricFontCss(
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined
): Promise<string> {
  if (!fetchImpl) return Promise.resolve('');
  if (!cachedLyricFontCssPromise) {
    cachedLyricFontCssPromise = (async () => {
      try {
        const res = await fetchImpl('./fonts/kaiu.ttf');
        if (!res.ok) {
          cachedLyricFontCssPromise = null;
          return '';
        }
        const buf = await res.arrayBuffer();
        if (!isValidFontBinary(new Uint8Array(buf))) {
          cachedLyricFontCssPromise = null;
          return '';
        }
        const b64 = arrayBufferToBase64(buf);
        return `@font-face { font-family: 'DFKai-SB'; src: url('data:font/ttf;base64,${b64}') format('truetype'); font-weight: normal; font-style: normal; }`;
      } catch {
        cachedLyricFontCssPromise = null;
        return '';
      }
    })();
  }
  return cachedLyricFontCssPromise;
}

export async function rasterizeSvgInBrowser(
  svgString: string,
  width: number = 2048,
  height: number = 1536
): Promise<Uint8Array> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const fontCss = await loadLyricFontCss();
  const preparedSvg = embedFontCssInSvg(svgString, fontCss);

  return new Promise((resolve, reject) => {
    const blob = new Blob([preparedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => {});
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('Failed to rasterize canvas to PNG blob'));
            return;
          }
          pngBlob.arrayBuffer().then((buf) => {
            resolve(new Uint8Array(buf));
          }).catch(reject);
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load SVG into image element: ${e}`));
    };

    img.src = url;
  });
}
