/**
 * Browser-native SVG-to-PNG rasterizer using HTML5 Canvas and document.fonts.ready.
 */
export async function rasterizeSvgInBrowser(
  svgString: string,
  width: number = 2048,
  height: number = 1536
): Promise<Uint8Array> {
  // Ensure custom Chinese web fonts are fully loaded before rasterization
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
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
