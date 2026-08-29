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
  isTie?: boolean;
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
  static readonly LYRIC_FONT = "'DFKai-SB', 'BiauKai', '標楷體', 'TW-Kai', 'STKaiti', 'KaiTi', serif";

  private calcCurveDistances(curves: CurveLayout[], nodes: NodeElement[]): void {
    // Check triplet intersections (matching Python _calc_distance)
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

      let dis = 2;
      let disMiddle = 9;
      const startNode = nodes[c.start];
      const endNode = nodes[c.end];
      const startNote = startNode && startNode.type === NodeType.NOTE ? (startNode.value as Note) : null;
      const endNote = endNode && endNode.type === NodeType.NOTE ? (endNode.value as Note) : null;

      if ((startNote && startNote.octave >= 1) || (endNote && endNote.octave >= 1)) {
        dis += 2;
        disMiddle += 2;
      }

      for (let kk = 0; kk < curves.length; kk++) {
        if (kk === k || curves[kk].hidden) continue;
        const cc = curves[kk];

        const cContainsCcProperly = c.start < cc.start && cc.end < c.end;
        const cContainsCc = c.start <= cc.start && cc.end <= c.end;

        if (cContainsCcProperly) {
          dis = Math.max(dis, calcDisY(kk, visited));
        } else if (cContainsCc) {
          dis = Math.max(dis, calcDisY(kk, visited) + 1);
        }
      }

      c.disY = dis;
      if (c.isTriplet) {
        c.disYMiddle = disMiddle;
      }
      return dis;
    };

    const calcDisX = (k: number, visited: Set<number>): number => {
      const c = curves[k];
      if (c.hidden) return 0;
      if (visited.has(k)) return c.disX;
      visited.add(k);

      let dis = 0.2;
      for (let kk = 0; kk < curves.length; kk++) {
        if (kk === k || curves[kk].hidden) continue;
        const cc = curves[kk];

        const ccContainsC = cc.start <= c.start && c.end <= cc.end;
        const ccContainsCProperly = cc.start < c.start && c.end < cc.end;

        if (ccContainsC && !ccContainsCProperly) {
          dis = Math.max(dis, calcDisX(kk, visited) + 0.2);
        }
      }

      c.disX = dis;
      return dis;
    };

    const visitedY = new Set<number>();
    for (let i = 0; i < curves.length; i++) {
      calcDisY(i, visitedY);
    }

    const visitedX = new Set<number>();
    for (let i = 0; i < curves.length; i++) {
      calcDisX(i, visitedX);
    }
  }

  renderLine(
    line: OutputLine,
    targetWidth: number = 888,
    noteFontSize: number = 94
  ): { svg: string; height: number } {
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
    const noteHalfWidth = Math.round(noteFontSize * 0.28);
    const ptToPx = noteFontSize * 0.10;

    // 1. Draw Barlines
    const barY1 = -Math.round(noteFontSize * 0.53);
    const barY2 = Math.round(noteFontSize * 0.33);
    for (const bPos of scaledBarPositions) {
      elements.push(
        `<line x1="${bPos}" y1="${barY1}" x2="${bPos}" y2="${barY2}" stroke="#ffffff" stroke-width="4.5" />`
      );
    }

    // 2. Draw Nodes (Notes, Dashes, Dots)
    const dashDotY = -Math.round(noteFontSize * 0.26);
    const dashHalfW = Math.round(noteFontSize * 0.12);
    const dashStroke = (noteFontSize * 0.075).toFixed(1);
    const dotR = (noteFontSize * 0.07).toFixed(1);
    // Lyric text baseline (matching LaTeX 17pt offset: 17pt * 0.10 * noteFontSize ≈ 1.66 * noteFontSize)
    const lyricY = Math.round(noteFontSize * 1.66);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const x = scaledNodePositions[i];

      if (node.type === NodeType.DASH) {
        // Hyphen width matching timesbd.ttf
        elements.push(
          `<line x1="${x - dashHalfW}" y1="${dashDotY}" x2="${x + dashHalfW}" y2="${dashDotY}" stroke="#ffffff" stroke-width="${dashStroke}" stroke-linecap="butt" />`
        );
      } else if (node.type === NodeType.DOT) {
        // Augmentation dot (1.5 beats)
        elements.push(
          `<circle cx="${x}" cy="${dashDotY}" r="${dotR}" fill="#ffffff" />`
        );
      } else if (node.type === NodeType.NOTE) {
        const note = node.value as Note;

        // Note number (Times New Roman Bold)
        elements.push(
          `<text x="${x}" y="0" fill="#ffffff" font-family="${SvgRenderer.MUSIC_FONT}" font-size="${noteFontSize}" font-weight="bold" text-anchor="middle">${note.name}</text>`
        );

        // Accidental
        if (note.acc !== null) {
          const accSymbol =
            note.acc === Accidental.Sharp ? '♯' : note.acc === Accidental.Flat ? '♭' : '♮';
          const accSize = Math.round(noteFontSize * 0.51);
          const accX = x - noteHalfWidth - Math.round(noteFontSize * 0.07);
          const accY = -Math.round(noteFontSize * 0.19);
          elements.push(
            `<text x="${accX}" y="${accY}" fill="#ffffff" font-family="${SvgRenderer.MUSIC_FONT}" font-size="${accSize}" text-anchor="end">${accSymbol}</text>`
          );
        }

        // Octave dots
        // In TikZ (src/writer.py line 180): \node[dot,above of=a{},node distance=6pt]
        // Center of note a{} is at -noteFontSize * 0.35. Dot is at nodeCenterY - 6 * ptToPx = -0.95 * noteFontSize
        if (note.octave > 0) {
          const baseDy = -noteFontSize * 0.95;
          const octStep = noteFontSize * 0.20;
          for (let oct = 0; oct < note.octave; oct++) {
            const dy = baseDy - oct * octStep;
            elements.push(
              `<circle cx="${x}" cy="${dy.toFixed(1)}" r="${dotR}" fill="#ffffff" />`
            );
          }
        } else if (note.octave < 0) {
          // In TikZ (src/writer.py line 190): \node[dot,below of=a{},node distance=nodeDistance pt]
          const depth = node.lines ? Math.max(0, -node.lines) : 0;
          const nodeDistance = 7 + (depth > 0 ? depth : 0);
          const baseDy = -noteFontSize * 0.35 + nodeDistance * ptToPx;
          const octStep = noteFontSize * 0.20;
          for (let oct = 0; oct < Math.abs(note.octave); oct++) {
            const dy = baseDy + oct * octStep;
            elements.push(
              `<circle cx="${x}" cy="${dy.toFixed(1)}" r="${dotR}" fill="#ffffff" />`
            );
          }
        }

        // Lyric text (標楷體 Bold)
        if (node.text) {
          elements.push(
            `<text x="${x}" y="${lyricY}" fill="#ffffff" font-family="${SvgRenderer.LYRIC_FONT}" font-size="${noteFontSize}" font-weight="bold" text-anchor="middle">${node.text}</text>`
          );
        }
      }
    }

    // 3. Underlines
    // In LaTeX (src/writer.py): underlines are drawn below note glyph:
    // (a{idx0}.south west) ++(0,-depth * 1.5pt)
    for (let depth = 1; depth < line.underlinesList.length; depth++) {
      const ranges = line.underlinesList[depth];
      const y = Math.round(noteFontSize * 0.18 + (depth - 1) * (noteFontSize * 0.17));
      for (const [start, end] of ranges.map((r) => [r.start, r.end])) {
        const x1 = scaledNodePositions[start] - noteHalfWidth;
        const x2 = scaledNodePositions[end] + noteHalfWidth;
        elements.push(
          `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#ffffff" stroke-width="4.5" stroke-linecap="butt" />`
        );
      }
    }

    // 4. Curves (Ties, Slurs, Triplets)
    const curves: CurveLayout[] = [];
    for (const tie of line.ties) {
      curves.push({ start: tie.start, end: tie.end, isTie: true, hidden: false, disY: 0, disX: 0 });
    }
    for (const slur of line.slurs) {
      curves.push({ start: slur.start, end: slur.end, hidden: false, disY: 0, disX: 0 });
    }
    for (const trip of line.triplets) {
      curves.push({
        start: trip.start,
        end: trip.end,
        isTriplet: true,
        tripletMiddle: trip.middle,
        hidden: false,
        disY: 0,
        disX: 0,
      });
    }

    this.calcCurveDistances(curves, nodes);

    // In LaTeX TikZ (src/writer.py line 231/242):
    // \draw[slur/tie] ([xshift=+{dis_x}pt]a{start}.north) ++(0,{dis_y}pt) to ...
    // a{start}.north is the top of the note digit (cap-height = 0.70 * noteFontSize above baseline).
    // The vertical position of the curve shifts dynamically based on noteFontSize:
    const nodeNorthY = -noteFontSize * 0.70;

    for (const c of curves) {
      if (c.hidden) continue;
      const x1 = scaledNodePositions[c.start];
      const x2 = scaledNodePositions[c.end];
      const shiftX = c.disX * scale;
      const startY = nodeNorthY - c.disY * ptToPx;

      if (c.isTriplet && c.tripletMiddle !== undefined) {
        // Draw triplet bracket matching TikZ tie0 & tie1:
        // In TikZ (src/writer.py line 266): \node[above of=a{middle},node distance={dis_y_middle}pt] (tri)
        // Center of note a{middle} is at -noteFontSize * 0.35
        const tripMidX = scaledNodePositions[c.tripletMiddle];
        const nodeCenterY = -noteFontSize * 0.35;
        const triY = nodeCenterY - (c.disYMiddle ?? 9) * ptToPx;
        const triWestX = tripMidX - 8 - 1 * scale;
        const triEastX = tripMidX + 8 + 1 * scale;

        const p0x = x1 + shiftX;
        const dist0_pt = Math.hypot((triWestX - p0x) / scale, (triY - startY) / ptToPx);
        const d0_pt = Math.min(20, 0.3915 * dist0_pt);
        const cos50 = 0.6427876;
        const sin50 = 0.7660444;
        const tc1x = p0x + d0_pt * cos50 * scale;
        const tc1y = startY - d0_pt * sin50 * ptToPx;
        const tc2x = triWestX - d0_pt * scale;
        const tc2y = triY;

        elements.push(
          `<path d="M ${p0x.toFixed(1)} ${startY.toFixed(1)} C ${tc1x.toFixed(1)} ${tc1y.toFixed(1)}, ${tc2x.toFixed(1)} ${tc2y.toFixed(1)}, ${triWestX.toFixed(1)} ${triY.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="4.5" />`
        );

        elements.push(
          `<text x="${tripMidX}" y="${triY + ptToPx * 1.2}" fill="#ffffff" font-size="${Math.round(noteFontSize * 0.37)}" font-weight="bold" font-family="${SvgRenderer.MUSIC_FONT}" text-anchor="middle">3</text>`
        );

        const p3x = x2 - shiftX;
        const dist1_pt = Math.hypot((p3x - triEastX) / scale, (triY - startY) / ptToPx);
        const d1_pt = Math.min(20, 0.3915 * dist1_pt);
        const tc1x_r = p3x - d1_pt * cos50 * scale;
        const tc1y_r = startY - d1_pt * sin50 * ptToPx;
        const tc2x_r = triEastX + d1_pt * scale;
        const tc2y_r = triY;

        elements.push(
          `<path d="M ${p3x.toFixed(1)} ${startY.toFixed(1)} C ${tc1x_r.toFixed(1)} ${tc1y_r.toFixed(1)}, ${tc2x_r.toFixed(1)} ${tc2y_r.toFixed(1)}, ${triEastX.toFixed(1)} ${triY.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="4.5" />`
        );
      } else {
        // TikZ slur / tie cubic Bézier: bend left=45, min distance=4pt, max distance=8pt (slur) / 5pt (tie)
        const p0x = x1 + shiftX;
        const p3x = x2 - shiftX;
        const D_pt = Math.abs(p3x - p0x) / scale;

        let d_pt = 0.3915 * D_pt;
        const maxD_pt = c.isTie ? 5 : 8;
        d_pt = Math.max(4, Math.min(maxD_pt, d_pt));

        const deltaX = d_pt * 0.70710678 * scale;
        const deltaY = d_pt * 0.70710678 * ptToPx;

        const c1x = p0x + deltaX;
        const c1y = startY - deltaY;
        const c2x = p3x - deltaX;
        const c2y = startY - deltaY;

        elements.push(
          `<path d="M ${p0x.toFixed(1)} ${startY.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p3x.toFixed(1)} ${startY.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="4.5" />`
        );
      }
    }

    return {
      svg: elements.join('\n'),
      height: 200,
    };
  }

  /**
   * Formats section tags (e.g. "<主歌>", "<主歌1>", "<Verse 1>").
   * In XeLaTeX with xeCJK:
   * - Chinese characters use CJK font (標楷體)
   * - Latin characters, digits, and '<' '>' use standard font (Times New Roman)
   * - Inter-script space (\CJKecglue) is inserted between CJK and alphanumeric characters
   * - Numbers like '1' in "<主歌1>" sit on the proper baseline in Times New Roman instead of elevated DFKai-SB digits
   */
  static formatSectionTag(tag: string): string {
    const spacedTag = tag
      .replace(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g, '$1 $2');

    const segments = spacedTag.split(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/);
    const isCjk = (s: string) => /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(s);

    const spans: { font: string; text: string }[] = [
      { font: SvgRenderer.MUSIC_FONT, text: '&lt;' },
    ];

    for (const seg of segments) {
      if (!seg) continue;
      const font = isCjk(seg) ? SvgRenderer.LYRIC_FONT : SvgRenderer.MUSIC_FONT;
      const last = spans[spans.length - 1];
      if (last && last.font === font) {
        last.text += seg;
      } else {
        spans.push({ font, text: seg });
      }
    }

    const last = spans[spans.length - 1];
    if (last && last.font === SvgRenderer.MUSIC_FONT) {
      last.text += '&gt;';
    } else {
      spans.push({ font: SvgRenderer.MUSIC_FONT, text: '&gt;' });
    }

    return spans.map((s) => `<tspan font-family="${s.font}">${s.text}</tspan>`).join('');
  }

  renderSlide(slide: SheetSlide, noteFontSize: number = 94): string {
    const W = SvgRenderer.SLIDE_WIDTH;
    const H = SvgRenderer.SLIDE_HEIGHT;
    // Scale matching LaTeX \scalebox{6.6} with 95/pos (95 * 6.6 * 1024 / 722.7 ≈ 888)
    const contentWidth = 888;
    // startX = 114 offsets node 0 so left margin of note/lyric ink is ~81-85px, matching LaTeX (~80px) and balancing with right margin (~86-90px)
    const startX = 114;

    const line1Render = this.renderLine(slide.line1, contentWidth, noteFontSize);
    const line2Render = slide.line2 ? this.renderLine(slide.line2, contentWidth, noteFontSize) : null;

    let tagElement = '';
    if (slide.sectionTag) {
      // In src/writer.py line 312: \textmd{$<$\hspace{-0pt}tag\hspace{-0pt}$>$}
      // In LaTeX output, <tag> starts at x ≈ 49.2px. Placing at x = 48 gives ink start at ~50px.
      const formattedTag = SvgRenderer.formatSectionTag(slide.sectionTag);
      tagElement = `<text x="48" y="75" fill="#ffffff" font-size="57" font-weight="normal">${formattedTag}</text>`;
    }

    const line1Y = 225;
    const line2Y = 535;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Solid black background for church projection -->
  <rect width="${W}" height="${H}" fill="#000000" />

  ${tagElement}

  <!-- Line 1 -->
  <g transform="translate(${startX}, ${line1Y})">
    ${line1Render.svg}
  </g>

  <!-- Line 2 -->
  ${
    line2Render
      ? `<g transform="translate(${startX}, ${line2Y})">
    ${line2Render.svg}
  </g>`
      : ''
  }
</svg>`;
  }

  /**
   * Renders the Slide 1 Title card matching ppt/template.pptx typography and layout.
   */
  static renderTitleSlideSvg(options?: {
    series?: string;
    title?: string;
    subtitle?: string;
    credits?: string;
  }): string {
    const W = SvgRenderer.SLIDE_WIDTH;
    const H = SvgRenderer.SLIDE_HEIGHT;
    const series = options?.series ?? '讚美之泉 22';
    const title = options?.title ?? '標題';
    const subtitle = options?.subtitle ?? 'Title';
    const credits = options?.credits ?? '詞： / 曲：';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#000000" />
  <!-- Series/Album Name (54pt -> 76px, bold 標楷體) -->
  <text x="137" y="178" fill="#ffff00" font-family="${SvgRenderer.LYRIC_FONT}" font-size="76" font-weight="bold">${series}</text>
  <!-- Main Title (106pt -> 150px, bold 標楷體, centered) -->
  <text x="512" y="390" fill="#ffcc00" font-family="${SvgRenderer.LYRIC_FONT}" font-size="150" font-weight="bold" text-anchor="middle">${title}</text>
  <!-- English/Secondary Subtitle (48pt -> 68px, bold Times New Roman, centered) -->
  <text x="512" y="518" fill="#ffcc00" font-family="${SvgRenderer.MUSIC_FONT}" font-size="68" font-weight="bold" text-anchor="middle">${subtitle}</text>
  <!-- Credits (40pt -> 56px, regular 標楷體, centered) -->
  <text x="512" y="682" fill="#ffffff" font-family="${SvgRenderer.LYRIC_FONT}" font-size="56" font-weight="normal" text-anchor="middle">${credits}</text>
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
