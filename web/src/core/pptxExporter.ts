import JSZip from 'jszip';
import { SongMetadata } from './types';
import { calculateTitleLayout, calculateSubtitleLayout } from './svgRenderer';

export interface PptxExportOptions {
  /** Template .pptx file buffer (e.g. template.pptx containing Slide 1 title card) */
  templateData: ArrayBuffer | Uint8Array;
  /** High-resolution PNG images for slides 2 to N */
  slidePngImages: (Uint8Array | Buffer)[];
  /** Optional song metadata to customize Slide 1 title card */
  metadata?: SongMetadata;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

/**
 * Slide 1 (title card) generation.
 *
 * The title card is generated from scratch rather than patched in place. Text
 * boxes must move and rescale when a title or subtitle wraps to two lines, so
 * substituting text into the template's fixed-geometry shapes is not enough.
 *
 * Geometry and font sizes are derived from the same layout functions that
 * drive the on-screen SVG preview, so the preview and the exported deck agree
 * by construction. The slide master, layout, and theme still come from
 * template.pptx.
 */

/** The SVG design canvas is 1024x768; the slide is 9144000x6858000 EMU (4:3). */
const EMU_PER_PX = 9144000 / 1024;

/**
 * Distance from a text baseline up to the visual center of its line, in em.
 * Text boxes are anchored center ("ctr") rather than top, because vertical
 * centering does not depend on the font's exact ascent metric the way
 * baseline alignment would.
 */
const BASELINE_TO_CENTER_EM = 0.3;

/**
 * Vertical padding added around a text block, in em. The block's own height
 * comes from its actual baseline spacing, so this only needs to cover the
 * ascent of the first line and the descent of the last.
 */
const LINE_BOX_PADDING_EM = 1.2;

function emu(valuePx: number): number {
  return Math.round(valuePx * EMU_PER_PX);
}

/**
 * Converts a font size on the SVG design canvas to OOXML `sz`
 * (hundredths of a point), calibrated against template.pptx.
 *
 * The canvas is 1024px wide over 10 inches, so 1px = 0.703125pt. Each element
 * carries its own calibration pair from the template so that default,
 * single-line output reproduces the hand-authored card exactly.
 */
function fontSz(fontSizePx: number, baseSizePx: number, baseSz: number): number {
  return Math.round((fontSizePx * baseSz) / baseSizePx);
}

interface TitleCardShape {
  /** Shape id, preserved from template.pptx so downstream tooling still matches. */
  id: number;
  /** One rendered paragraph per entry. */
  lines: string[];
  /** Font size on the SVG design canvas. */
  fontSizePx: number;
  /** OOXML font size in hundredths of a point. */
  sz: number;
  /** Baseline y coordinate per line, on the SVG design canvas. */
  lineYCoords: number[];
  boxXPx: number;
  boxWidthPx: number;
  align: 'l' | 'ctr';
  bold: boolean;
  /** Fill color as a six digit hex string, without a leading '#'. */
  colorHex: string;
  latinFont: string;
  eaFont: string;
  lang: string;
  /** Line spacing percentage in OOXML units (100000 == 100%). */
  lineSpacingPct: number;
}

function buildTextShape(shape: TitleCardShape): string {
  const {
    id, lines, fontSizePx, sz, lineYCoords, boxXPx, boxWidthPx,
    align, bold, colorHex, latinFont, eaFont, lang, lineSpacingPct,
  } = shape;

  // Size the box to the text block's real extent: the span between its first
  // and last baseline, plus one em of padding for ascent and descent. Anchor
  // it on the block's visual center so a second line grows symmetrically,
  // matching the SVG layout.
  const firstBaseline = lineYCoords[0];
  const lastBaseline = lineYCoords[lineYCoords.length - 1];
  const centerYPx = (firstBaseline + lastBaseline) / 2 - BASELINE_TO_CENTER_EM * fontSizePx;
  const boxHeightPx = lastBaseline - firstBaseline + fontSizePx * LINE_BOX_PADDING_EM;
  const boxTopPx = centerYPx - boxHeightPx / 2;

  const b = bold ? '1' : '0';
  const paragraphs = lines
    .map((line) => {
      const rPr =
        `<a:rPr b="${b}" lang="${lang}" sz="${sz}" spc="-1" strike="noStrike">` +
        `<a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>` +
        `<a:latin typeface="${latinFont}"/><a:ea typeface="${eaFont}"/></a:rPr>`;
      return (
        `<a:p><a:pPr algn="${align}">` +
        `<a:lnSpc><a:spcPct val="${lineSpacingPct}"/></a:lnSpc>` +
        `<a:spcBef><a:spcPts val="11"/></a:spcBef>` +
        `<a:spcAft><a:spcPts val="11"/></a:spcAft>` +
        `</a:pPr>` +
        `<a:r>${rPr}<a:t>${escapeXml(line)}</a:t></a:r>` +
        `</a:p>`
      );
    })
    .join('');

  return (
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="${id}" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${emu(boxXPx)}" y="${emu(boxTopPx)}"/>` +
    `<a:ext cx="${emu(boxWidthPx)}" cy="${emu(boxHeightPx)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln w="0"><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr>` +
    paragraphs +
    `</p:txBody>` +
    `</p:sp>`
  );
}

/**
 * The slide number placeholder, carried over verbatim from template.pptx.
 * tools/ppt-overlay relies on this field when restoring slide numbers.
 */
const SLIDE_NUMBER_SHAPE_XML =
  `<p:sp>` +
  `<p:nvSpPr><p:cNvPr id="41" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:spPr>` +
  `<a:xfrm><a:off x="6588000" y="6237360"/><a:ext cx="2133360" cy="475920"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
  `<a:noFill/><a:ln w="0"><a:noFill/></a:ln>` +
  `</p:spPr>` +
  `<p:txBody>` +
  `<a:bodyPr lIns="90000" rIns="90000" tIns="46800" bIns="46800" anchor="t"><a:noAutofit/></a:bodyPr>` +
  `<a:p><a:pPr algn="r">` +
  `<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>` +
  `<a:spcBef><a:spcPts val="11"/></a:spcBef>` +
  `<a:spcAft><a:spcPts val="11"/></a:spcAft>` +
  `</a:pPr>` +
  `<a:fld id="{F111531D-02C4-4288-9CCC-642DD858DD17}" type="slidenum">` +
  `<a:rPr b="0" lang="en-US" sz="2400" spc="-1" strike="noStrike">` +
  `<a:solidFill><a:srgbClr val="0066cc"/></a:solidFill>` +
  `<a:latin typeface="Times New Roman"/><a:ea typeface="DejaVu Sans"/></a:rPr>` +
  `<a:t>&lt;number&gt;</a:t>` +
  `</a:fld>` +
  `</a:p>` +
  `</p:txBody>` +
  `</p:sp>`;

/**
 * Builds the complete ppt/slides/slide1.xml for the given metadata.
 */
export function buildSlide1Xml(metadata?: SongMetadata): string {
  const titleLayout = calculateTitleLayout(metadata?.title);
  const isTitleMultiLine = titleLayout.lines.length > 1;
  const subtitleLayout = calculateSubtitleLayout(metadata?.subtitle, isTitleMultiLine);

  const album = metadata?.album || '專輯';
  const credits = metadata?.credits || '詞： / 曲：';

  const shapes = [
    SLIDE_NUMBER_SHAPE_XML,

    // Album: left aligned, matching the SVG anchor at x=137, baseline y=178.
    buildTextShape({
      id: 42,
      lines: [album],
      fontSizePx: 76,
      sz: fontSz(76, 76, 5400),
      lineYCoords: [178],
      boxXPx: 137,
      boxWidthPx: 750,
      align: 'l',
      bold: true,
      colorHex: 'ffff00',
      latinFont: '標楷體',
      eaFont: '標楷體',
      lang: 'zh-TW',
      lineSpacingPct: 100000,
    }),

    // Title: centered, auto-scaled, one paragraph per line.
    buildTextShape({
      id: 43,
      lines: titleLayout.lines,
      fontSizePx: titleLayout.fontSize,
      sz: fontSz(titleLayout.fontSize, 150, 10600),
      lineYCoords: titleLayout.lineYCoords,
      boxXPx: 72,
      boxWidthPx: 880,
      align: 'ctr',
      bold: true,
      colorHex: 'ffcc00',
      latinFont: '標楷體',
      eaFont: '標楷體',
      lang: 'zh-TW',
      lineSpacingPct: 90000,
    }),

    // Subtitle: centered, auto-scaled, one paragraph per line.
    buildTextShape({
      id: 44,
      lines: subtitleLayout.lines,
      fontSizePx: subtitleLayout.fontSize,
      sz: fontSz(subtitleLayout.fontSize, 68, 4800),
      lineYCoords: subtitleLayout.lineYCoords,
      boxXPx: 0,
      boxWidthPx: 1024,
      align: 'ctr',
      bold: true,
      colorHex: 'ffcc00',
      latinFont: 'Times New Roman',
      eaFont: '標楷體',
      lang: 'en-US',
      lineSpacingPct: 100000,
    }),

    // Credits: centered, regular weight.
    buildTextShape({
      id: 45,
      lines: [credits],
      fontSizePx: 56,
      sz: fontSz(56, 56, 4000),
      lineYCoords: [682],
      boxXPx: 0,
      boxWidthPx: 1024,
      align: 'ctr',
      bold: false,
      colorHex: 'ffffff',
      latinFont: 'Times New Roman',
      eaFont: '標楷體',
      lang: 'zh-TW',
      lineSpacingPct: 100000,
    }),
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/**
 * Appends rendered notation slide images to template.pptx (preserving Slide 1 title slide).
 * Employs OpenXML standard packaging via JSZip.
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

    // 2. Add slide XML with image element (4:3 aspect ratio = 9144000 x 6858000 EMU)
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
          <a:blip r:embed="rId2"/>
          <a:stretch>
            <a:fillRect/>
          </a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="9144000" cy="6858000"/>
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
    zip.file(slideXmlPath, slideXml);

    // 3. Add slide relationships file
    const slideRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageNum}.png"/>
</Relationships>`;
    zip.file(slideRelsPath, slideRelsXml);

    // 4. Update [Content_Types].xml override
    const overrideEntry = `<Override PartName="/${slideXmlPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    updatedContentTypes = updatedContentTypes.replace('</Types>', `${overrideEntry}</Types>`);

    // 5. Update presentation.xml.rels
    const relEntry = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`;
    updatedPresRels = updatedPresRels.replace('</Relationships>', `${relEntry}</Relationships>`);

    // 6. Accumulate presentation.xml slide elements
    newSldIdXmlElements += `<p:sldId id="${slideId}" r:id="${relId}"/>`;
  }

  // Update presentation.xml
  const updatedPresXml = presXml.replace('</p:sldIdLst>', `${newSldIdXmlElements}</p:sldIdLst>`);

  // Regenerate Slide 1 (title card) from metadata. Always rebuilt so that the
  // exported card matches the on-screen preview even when no metadata is set.
  zip.file('ppt/slides/slide1.xml', buildSlide1Xml(options.metadata));

  // Write updated XML files back to zip
  zip.file('[Content_Types].xml', updatedContentTypes);
  zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);
  zip.file('ppt/presentation.xml', updatedPresXml);

  // Generate output zip buffer
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
