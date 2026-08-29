import JSZip from 'jszip';

export interface PptxExportOptions {
  /** Template .pptx file buffer (e.g. template.pptx containing Slide 1 title card) */
  templateData: ArrayBuffer | Uint8Array;
  /** High-resolution PNG images for slides 2 to N */
  slidePngImages: (Uint8Array | Buffer)[];
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

  // Write updated XML files back to zip
  zip.file('[Content_Types].xml', updatedContentTypes);
  zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);
  zip.file('ppt/presentation.xml', updatedPresXml);

  // Generate output zip buffer
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
