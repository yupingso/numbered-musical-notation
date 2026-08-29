import {
  NodeType,
  NodeElement,
  Note,
  OutputLine,
  SheetSlide,
  Accidental,
} from './types';

interface CurveLayout {
  start: number;
  end: number;
  isTriplet?: boolean;
  tripletMiddle?: number;
  hidden: boolean;
  disY: number;
  disX: number;
  disYMiddle?: number;
}

export class SvgRenderer {
  // 4:3 Aspect Ratio standard dimensions
  static readonly SLIDE_WIDTH = 1024;
  static readonly SLIDE_HEIGHT = 768;

  // Font families
  static readonly MUSIC_FONT = "'Times New Roman', 'Liberation Serif', serif";
  static readonly LYRIC_FONT = "'Noto Sans TC', 'Microsoft YaHei', 'PingFang TC', 'SimHei', sans-serif";

  private calcCurveDistances(curves: CurveLayout[], nodes: NodeElement[]): void {
    // Check triplet intersections
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const c0 = curves[i];
        const c1 = curves[j];
        if (!c1.isTriplet) continue;

        const contains = c0.start <= c1.start && c1.end <= c0.end;
        const intersects = c0.start < c1.end && c1.start < c0.end;
        const crosses = intersects && !contains && !(c1.start <= c0.start && c0.end <= c1.end);

        if (contains || crosses) {
          c0.hidden = true;
        }
      }
    }

    const calcDisY = (k: number, visited: Set<number>): number => {
      const c = curves[k];
      if (c.hidden) return 0;
      if (visited.has(k)) return c.disY;
      visited.add(k);

      let dis = 6;
      let disMiddle = 24;
      const startNote = nodes[c.start].value as Note;
      const endNote = nodes[c.end].value as Note;

      if ((startNote && startNote.octave >= 1) || (endNote && endNote.octave >= 1)) {
        dis += 6;
        disMiddle += 6;
      }

      for (let kk = 0; kk < curves.length; kk++) {
        if (kk === k || curves[kk].hidden) continue;
        const cc = curves[kk];

        const cContainsCcProperly = c.start < cc.start && cc.end < c.end;
        const cContainsCc = c.start <= cc.start && cc.end <= c.end;

        if (cContainsCcProperly) {
          dis = Math.max(dis, calcDisY(kk, visited));
        } else if (cContainsCc) {
          dis = Math.max(dis, calcDisY(kk, visited) + 4);
        }
      }

      c.disY = dis;
      if (c.isTriplet) {
        c.disYMiddle = disMiddle;
      }
      return dis;
    };

    const visitedY = new Set<number>();
    for (let i = 0; i < curves.length; i++) {
      calcDisY(i, visitedY);
    }
  }

  renderLine(line: OutputLine, targetWidth: number = 900): { svg: string; height: number } {
    const nodes = line.nodes;
    const nodePositions: number[] = new Array(nodes.length).fill(0);

    let rawPos = 0;
    const barPositions: number[] = [];

    for (let k = 0; k < line.bars.length; k++) {
      const bar = line.bars[k];
      if (k > 0) {
        rawPos -= 2.5;
        barPositions.push(rawPos);
        rawPos += 7.5;
      }

      const nextBar = line.bars[k + 1];
      const endIdx = nextBar ? nextBar.nodeIndex : nodes.length;

      for (let idx = bar.nodeIndex; idx < endIdx; idx++) {
        const node = nodes[idx];
        if (node.type !== NodeType.NOTE) {
          rawPos -= 2.5;
          nodePositions[idx] = rawPos;
          rawPos += 7.5;
          continue;
        }
        nodePositions[idx] = rawPos;
        rawPos += 10;
      }
    }

    const scale = rawPos > 0 ? targetWidth / rawPos : 1;
    const scaledNodePositions = nodePositions.map((p) => p * scale);
    const scaledBarPositions = barPositions.map((p) => p * scale);

    const elements: string[] = [];

    // 1. Draw Barlines
    for (const bPos of scaledBarPositions) {
      elements.push(
        `<line x1="${bPos}" y1="-14" x2="${bPos}" y2="14" stroke="#ffffff" stroke-width="1.5" />`
      );
    }

    // 2. Draw Nodes (Notes, Dashes, Dots)
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const x = scaledNodePositions[i];

      if (node.type === NodeType.DASH) {
        elements.push(
          `<line x1="${x - 4 * scale}" y1="0" x2="${x + 4 * scale}" y2="0" stroke="#ffffff" stroke-width="1.8" />`
        );
      } else if (node.type === NodeType.DOT) {
        elements.push(
          `<circle cx="${x}" cy="0" r="${1.8 * Math.min(scale, 1.2)}" fill="#ffffff" />`
        );
      } else if (node.type === NodeType.NOTE) {
        const note = node.value as Note;

        // Note number
        elements.push(
          `<text x="${x}" y="7" fill="#ffffff" font-family="${SvgRenderer.MUSIC_FONT}" font-size="${24 * Math.min(scale, 1.2)}" font-weight="bold" text-anchor="middle">${note.name}</text>`
        );

        // Accidental
        if (note.acc !== null) {
          const accSymbol =
            note.acc === Accidental.Sharp ? '♯' : note.acc === Accidental.Flat ? '♭' : '♮';
          elements.push(
            `<text x="${x - 9 * scale}" y="0" fill="#ffffff" font-size="${12 * scale}" text-anchor="middle">${accSymbol}</text>`
          );
        }

        // Octave dots
        if (note.octave > 0) {
          for (let oct = 0; oct < note.octave; oct++) {
            const dy = -14 - oct * 6;
            elements.push(
              `<circle cx="${x}" cy="${dy}" r="2" fill="#ffffff" />`
            );
          }
        } else if (note.octave < 0) {
          const depth = node.lines ? Math.max(0, -node.lines) : 0;
          const baseDy = 18 + depth * 5;
          for (let oct = 0; oct < Math.abs(note.octave); oct++) {
            const dy = baseDy + oct * 6;
            elements.push(
              `<circle cx="${x}" cy="${dy}" r="2" fill="#ffffff" />`
            );
          }
        }

        // Lyric text
        if (node.text) {
          elements.push(
            `<text x="${x}" y="52" fill="#ffffff" font-family="${SvgRenderer.LYRIC_FONT}" font-size="28" font-weight="normal" text-anchor="middle">${node.text}</text>`
          );
        }
      }
    }

    // 3. Underlines
    for (let depth = 1; depth < line.underlinesList.length; depth++) {
      const ranges = line.underlinesList[depth];
      const y = 12 + (depth - 1) * 5;
      for (const [start, end] of ranges.map((r) => [r.start, r.end])) {
        const x1 = scaledNodePositions[start] - 6 * scale;
        const x2 = scaledNodePositions[end] + 6 * scale;
        elements.push(
          `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#ffffff" stroke-width="1.8" />`
        );
      }
    }

    // 4. Curves (Ties & Slurs)
    const curves: CurveLayout[] = [];
    for (const tie of line.ties) {
      curves.push({ start: tie.start, end: tie.end, hidden: false, disY: 6, disX: 1 });
    }
    for (const slur of line.slurs) {
      curves.push({ start: slur.start, end: slur.end, hidden: false, disY: 6, disX: 1 });
    }
    for (const trip of line.triplets) {
      curves.push({
        start: trip.start,
        end: trip.end,
        isTriplet: true,
        tripletMiddle: trip.middle,
        hidden: false,
        disY: 6,
        disX: 1,
      });
    }

    this.calcCurveDistances(curves, nodes);

    for (const c of curves) {
      if (c.hidden) continue;
      const x1 = scaledNodePositions[c.start];
      const x2 = scaledNodePositions[c.end];
      const midX = (x1 + x2) / 2;
      const arcHeight = c.disY * 2.2 + 8;
      const startY = -12;
      const peakY = startY - arcHeight;

      if (c.isTriplet && c.tripletMiddle !== undefined) {
        // Draw triplet bracket with number 3
        const tripMidX = scaledNodePositions[c.tripletMiddle];
        elements.push(
          `<path d="M ${x1} ${startY} Q ${x1} ${peakY} ${tripMidX - 8} ${peakY}" fill="none" stroke="#ffffff" stroke-width="1.5" />`
        );
        elements.push(
          `<text x="${tripMidX}" y="${peakY + 4}" fill="#ffffff" font-size="14" font-family="${SvgRenderer.MUSIC_FONT}" text-anchor="middle">3</text>`
        );
        elements.push(
          `<path d="M ${tripMidX + 8} ${peakY} Q ${x2} ${peakY} ${x2} ${startY}" fill="none" stroke="#ffffff" stroke-width="1.5" />`
        );
      } else {
        // Smooth quadratic or cubic Bézier curve for slur/tie
        elements.push(
          `<path d="M ${x1} ${startY} Q ${midX} ${peakY} ${x2} ${startY}" fill="none" stroke="#ffffff" stroke-width="1.6" />`
        );
      }
    }

    return {
      svg: elements.join('\n'),
      height: 120,
    };
  }

  renderSlide(slide: SheetSlide): string {
    const W = SvgRenderer.SLIDE_WIDTH;
    const H = SvgRenderer.SLIDE_HEIGHT;
    const contentWidth = W - 120; // 60px margin on each side

    const line1Render = this.renderLine(slide.line1, contentWidth);
    const line2Render = slide.line2 ? this.renderLine(slide.line2, contentWidth) : null;

    let tagElement = '';
    if (slide.sectionTag) {
      tagElement = `<text x="60" y="80" fill="#ffffff" font-family="${SvgRenderer.LYRIC_FONT}" font-size="28" font-weight="bold">&lt;${slide.sectionTag}&gt;</text>`;
    }

    const line1Y = 240;
    const line2Y = 520;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Solid black background for church projection -->
  <rect width="${W}" height="${H}" fill="#000000" />

  ${tagElement}

  <!-- Line 1 -->
  <g transform="translate(60, ${line1Y})">
    ${line1Render.svg}
  </g>

  <!-- Line 2 -->
  ${
    line2Render
      ? `<g transform="translate(60, ${line2Y})">
    ${line2Render.svg}
  </g>`
      : ''
  }
</svg>`;
  }
}

export function splitAstIntoSlides(sections: { tag: string; lines: OutputLine[] }[]): SheetSlide[] {
  const slides: SheetSlide[] = [];
  let slideIndex = 1;

  for (const section of sections) {
    for (let j = 0; j < section.lines.length; j += 2) {
      const isFirstPageInSection = j === 0;
      slides.push({
        slideIndex: slideIndex++,
        sectionTag: isFirstPageInSection ? section.tag : null,
        line1: section.lines[j],
        line2: j + 1 < section.lines.length ? section.lines[j + 1] : null,
      });
    }
  }

  return slides;
}
