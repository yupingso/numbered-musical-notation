#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parseClassicSong } from './core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from './core/svgRenderer';
import { rasterizeSvgToPngBuffer } from './core/rasterizerCli';
import { appendSlidesToPptx } from './core/pptxExporter';

function printHelp() {
  console.log(`
Worship Numbered Musical Notation to Presentation Slides (CLI)

Usage:
  npx tsx src/cli.ts <input> [output.pptx] [options]

Arguments:
  <input>                 Path to song directory (containing melody.txt and lyrics.txt)
                          or a single notation sheet file.
  [output.pptx]           Optional destination path (default: output.pptx)

Options:
  -o, --output <path>     Output .pptx path (default: output.pptx)
  -t, --template <path>   Path to template.pptx (default: public/template.pptx or ../ppt/template.pptx)
  -h, --help              Show this help message

Examples:
  npx tsx src/cli.ts ../songs/song01
  npx tsx src/cli.ts ../songs/song01 song01.pptx
  npx tsx src/cli.ts ../songs/song01 -o presentation.pptx -t custom_template.pptx
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let inputArg = '';
  let outputPath = 'output.pptx';
  let templatePath = '';

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      outputPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '-t' || arg === '--template') {
      templatePath = path.resolve(process.cwd(), args[++i]);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    inputArg = path.resolve(process.cwd(), positional[0]);
    if (positional.length > 1 && outputPath === 'output.pptx') {
      outputPath = path.resolve(process.cwd(), positional[1]);
    }
  }

  if (!inputArg) {
    console.error('Error: Missing required <input> argument.');
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(inputArg)) {
    console.error(`Error: Input path not found: ${inputArg}`);
    process.exit(1);
  }

  const stat = fs.statSync(inputArg);
  let ast;

  if (stat.isDirectory()) {
    const melodyPath = path.join(inputArg, 'melody.txt');
    const lyricsPath = path.join(inputArg, 'lyrics.txt');

    if (!fs.existsSync(melodyPath)) {
      console.error(`Error: Melody file not found in directory: ${melodyPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(lyricsPath)) {
      console.error(`Error: Lyrics file not found in directory: ${lyricsPath}`);
      process.exit(1);
    }

    console.log(`Loading song from directory: ${inputArg}`);
    console.log(`  - Melody: ${melodyPath}`);
    console.log(`  - Lyrics: ${lyricsPath}`);

    const melodyText = fs.readFileSync(melodyPath, 'utf-8');
    const lyricsText = fs.readFileSync(lyricsPath, 'utf-8');
    ast = parseClassicSong(melodyText, lyricsText);
  } else if (stat.isFile()) {
    console.log(`Loading song from file: ${inputArg}`);
    console.error('Error: Single-file notation parser is not yet implemented. Please specify a song directory containing melody.txt and lyrics.txt.');
    process.exit(1);
  } else {
    console.error(`Error: Invalid input path: ${inputArg}`);
    process.exit(1);
  }

  if (!templatePath) {
    const localTemplate = path.resolve(__dirname, '../public/template.pptx');
    const repoTemplate = path.resolve(__dirname, '../../ppt/template.pptx');
    if (fs.existsSync(localTemplate)) {
      templatePath = localTemplate;
    } else if (fs.existsSync(repoTemplate)) {
      templatePath = repoTemplate;
    } else {
      console.error('Error: Base template.pptx not found');
      process.exit(1);
    }
  }

  console.log(`Using template: ${templatePath}`);
  const templateData = fs.readFileSync(templatePath);

  const slides = splitAstIntoSlides(ast.sections);
  console.log(`Parsed ${ast.sections.length} sections, generated ${slides.length} notation slides`);

  const renderer = new SvgRenderer();
  const pngImages: Buffer[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const tagInfo = slide.sectionTag ? ` [${slide.sectionTag}]` : '';
    process.stdout.write(`Rendering slide ${i + 1}/${slides.length}${tagInfo}... `);
    const svg = renderer.renderSlide(slide);
    const pngBuf = rasterizeSvgToPngBuffer(svg, 2048);
    pngImages.push(pngBuf);
    console.log('done.');
  }

  console.log('Assembling PPTX presentation with JSZip...');
  const pptxBytes = await appendSlidesToPptx({
    templateData,
    slidePngImages: pngImages,
  });

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, Buffer.from(pptxBytes));
  console.log(`✓ Presentation successfully saved to: ${outputPath} (${(pptxBytes.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
