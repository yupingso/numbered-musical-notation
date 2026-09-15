import JSZip from 'jszip';

/** The deck is 4:3: 10in x 7.5in, expressed in English Metric Units. */
const SLIDE_WIDTH_EMU = 9144000;
const SLIDE_HEIGHT_EMU = 6858000;

/** Relationship id used by every generated slide to reference its image. */
const SLIDE_IMAGE_REL_ID = 'rId2';

export interface PptxExportOptions {
  /** Template .pptx buffer supplying the slide master, layouts and theme */
  templateData: ArrayBuffer | Uint8Array;
  /** High-resolution PNGs for the notation slides, which become slides 2..N */
  slidePngImages: (Uint8Array | Buffer)[];
  /**
   * High-resolution PNG of the title card, which replaces Slide 1.
   *
   * The title card ships as an image rather than as native text so that the
   * exported deck is a pixel-exact copy of the on-screen design canvas, and so
   * that it does not depend on 標楷體 being installed wherever the file is
   * opened (the template embeds no fonts). When omitted, the template's own
   * Slide 1 is left untouched.
   */
  titlePngImage?: Uint8Array | Buffer;
}

/**
 * Builds a slide whose sole content is one full-bleed image.
 *
 * The image is stretched to the full slide, so the source PNG should already
 * match the deck's 4:3 aspect ratio.
 */
function buildImageSlideXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="NMN Slide Image"/>
          <p:cNvPicPr>
            <a:picLocks noChangeAspect="1"/>
          </p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${SLIDE_IMAGE_REL_ID}"/>
          <a:stretch>
            <a:fillRect/>
          </a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="${SLIDE_WIDTH_EMU}" cy="${SLIDE_HEIGHT_EMU}"/>
          </a:xfrm>
          <a:prstGeom prst="rect">
            <a:avLst/>
          </a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`;
}

/** Builds the .rels part pairing an image slide with its layout and PNG. */
function buildImageSlideRels(imageNum: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="${SLIDE_IMAGE_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageNum}.png"/>
</Relationships>`;
}

/**
 * Builds the exported deck from template.pptx.
 *
 * Every slide, including the Slide 1 title card, is emitted as a single
 * full-bleed image, so the deck renders identically regardless of the fonts
 * installed on the machine that opens it. The template supplies the slide
 * master, layouts and theme. Employs OpenXML standard packaging via JSZip.
 */
export async function appendSlidesToPptx(options: PptxExportOptions): Promise<Uint8Array> {
  const { templateData, slidePngImages } = options;
  const zip = await JSZip.loadAsync(templateData);

  // 1. Read and parse [Content_Types].xml
  const contentTypesXml = await zip.file('[Content_Types].xml')?.async('text');
  if (!contentTypesXml) {
    throw new Error('Invalid PPTX template: [Content_Types].xml not found');
  }

  // 2. Read and parse ppt/_rels/presentation.xml.rels
  const presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
  if (!presRelsXml) {
    throw new Error('Invalid PPTX template: ppt/_rels/presentation.xml.rels not found');
  }

  // 3. Read and parse ppt/presentation.xml
  const presXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presXml) {
    throw new Error('Invalid PPTX template: ppt/presentation.xml not found');
  }

  // Find existing slide count and IDs
  const slideMatches = presXml.match(/<p:sldId id="(\d+)" r:id="([^"]+)"\/>/g) || [];
  let nextSlideId = 256;
  let maxRelIdNum = 1;

  // Scan existing relationship IDs in presentation.xml.rels
  const relIdMatches = presRelsXml.match(/Id="rId(\d+)"/g) || [];
  for (const m of relIdMatches) {
    const num = parseInt(m.replace(/[^0-9]/g, ''), 10);
    if (num > maxRelIdNum) maxRelIdNum = num;
  }

  // Scan existing slide IDs in presentation.xml
  for (const m of slideMatches) {
    const idMatch = m.match(/id="(\d+)"/);
    if (idMatch) {
      const idNum = parseInt(idMatch[1], 10);
      if (idNum >= nextSlideId) nextSlideId = idNum + 1;
    }
  }

  // Find existing image numbers in ppt/media/
  let nextImageNum = 1;
  for (const filename of Object.keys(zip.files)) {
    const imgMatch = filename.match(/^ppt\/media\/image(\d+)\.png$/);
    if (imgMatch) {
      const num = parseInt(imgMatch[1], 10);
      if (num >= nextImageNum) nextImageNum = num + 1;
    }
  }

  let nextSlideNum = slideMatches.length + 1;
  let updatedContentTypes = contentTypesXml;
  let updatedPresRels = presRelsXml;
  let newSldIdXmlElements = '';

  // Replace Slide 1 with the rendered title card image. The template's own
  // Slide 1 already has a [Content_Types] override and a presentation.xml
  // entry, so only its body, rels and media need to be supplied.
  if (options.titlePngImage) {
    const titleImageNum = nextImageNum++;
    zip.file(`ppt/media/image${titleImageNum}.png`, options.titlePngImage);
    zip.file('ppt/slides/slide1.xml', buildImageSlideXml());
    zip.file('ppt/slides/_rels/slide1.xml.rels', buildImageSlideRels(titleImageNum));
  }

  for (let i = 0; i < slidePngImages.length; i++) {
    const slideNum = nextSlideNum++;
    const slideId = nextSlideId++;
    const relId = `rId${++maxRelIdNum}`;
    const imageNum = nextImageNum++;

    const imageFilename = `ppt/media/image${imageNum}.png`;
    const slideXmlPath = `ppt/slides/slide${slideNum}.xml`;
    const slideRelsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;

    // 1. Add PNG media file
    zip.file(imageFilename, slidePngImages[i]);

    // 2. Add slide XML and its relationships, identical in shape to Slide 1
    zip.file(slideXmlPath, buildImageSlideXml());
    zip.file(slideRelsPath, buildImageSlideRels(imageNum));

    // 3. Update [Content_Types].xml override
    const overrideEntry = `<Override PartName="/${slideXmlPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    updatedContentTypes = updatedContentTypes.replace('</Types>', `${overrideEntry}</Types>`);

    // 4. Update presentation.xml.rels
    const relEntry = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`;
    updatedPresRels = updatedPresRels.replace('</Relationships>', `${relEntry}</Relationships>`);

    // 5. Accumulate presentation.xml slide elements
    newSldIdXmlElements += `<p:sldId id="${slideId}" r:id="${relId}"/>`;
  }

  // Update presentation.xml
  const updatedPresXml = presXml.replace('</p:sldIdLst>', `${newSldIdXmlElements}</p:sldIdLst>`);

  // Write updated XML files back to zip
  zip.file('[Content_Types].xml', updatedContentTypes);
  zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);
  zip.file('ppt/presentation.xml', updatedPresXml);

  // Generate output zip buffer
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
