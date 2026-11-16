/**
 * Browser-native SVG-to-PNG rasterizer using HTML5 Canvas.
 *
 * Standalone SVGs loaded via `new Image()` (`<img src="blob:...">`) run in an
 * isolated browser document that cannot access page CSS (`@font-face` in
 * `index.css` or `document.fonts`) and blocks external URL fetches. To ensure
 * Traditional Chinese lyrics (`DFKai-SB` / `kaiu.ttf`) and numbered musical
 * notation digits/tags (`NMNMusic` / `times.ttf` + `timesbd.ttf`) render
 * identically across all devices during `.pptx` export, we fetch the bundled
 * TrueType fonts once, encode them as `data:font/ttf;base64,...` URIs, and
 * inline `<defs><style>...</style></defs>` directly into the SVG before rasterizing.
 */

const BASE64_CHUNK_SIZE = 0x8000;

interface BundledFontSpec {
  url: string;
  family: string;
  weight: string;
}

const LYRIC_FONT_SPEC: BundledFontSpec = {
  url: './fonts/kaiu.ttf',
  family: 'DFKai-SB',
  weight: 'normal',
};

const EMBEDDED_FONT_SPECS: readonly BundledFontSpec[] = [
  LYRIC_FONT_SPEC,
  { url: './fonts/times.ttf', family: 'NMNMusic', weight: '400' },
  { url: './fonts/timesbd.ttf', family: 'NMNMusic', weight: '700' },
];

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

const cachedFontCssPromises = new Map<string, Promise<string>>();

export function resetLyricFontCssCacheForTests(): void {
  cachedFontCssPromises.clear();
}

function loadSingleFontCss(
  spec: BundledFontSpec,
  fetchImpl: typeof fetch | undefined
): Promise<string> {
  if (!fetchImpl) return Promise.resolve('');
  let existing = cachedFontCssPromises.get(spec.url);
  if (!existing) {
    existing = (async () => {
      try {
        const res = await fetchImpl(spec.url);
        if (!res.ok) {
          cachedFontCssPromises.delete(spec.url);
          return '';
        }
        const buf = await res.arrayBuffer();
        if (!isValidFontBinary(new Uint8Array(buf))) {
          cachedFontCssPromises.delete(spec.url);
          return '';
        }
        const b64 = arrayBufferToBase64(buf);
        return `@font-face { font-family: '${spec.family}'; src: url('data:font/ttf;base64,${b64}') format('truetype'); font-weight: ${spec.weight}; font-style: normal; }`;
      } catch {
        cachedFontCssPromises.delete(spec.url);
        return '';
      }
    })();
    cachedFontCssPromises.set(spec.url, existing);
  }
  return existing;
}

export function loadLyricFontCss(
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined
): Promise<string> {
  return loadSingleFontCss(LYRIC_FONT_SPEC, fetchImpl);
}

export async function loadEmbeddedFontCss(
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined
): Promise<string> {
  if (!fetchImpl) return '';
  const rules = await Promise.all(
    EMBEDDED_FONT_SPECS.map((spec) => loadSingleFontCss(spec, fetchImpl))
  );
  return rules.filter(Boolean).join('\n  ');
}

export async function rasterizeSvgInBrowser(
  svgString: string,
  width: number = 2048,
  height: number = 1536
): Promise<Uint8Array> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const fontCss = await loadEmbeddedFontCss();
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
