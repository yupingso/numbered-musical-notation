import React, { useState, useMemo } from 'react';
import { calculateLineLayout, SvgRenderer } from '../core/svgRenderer';
import { NodeElement, NodeType, Note, OutputLine, SheetSlide } from '../core/types';

export interface SelectedUnitContext {
  lineIdx: number;
  nodeIdx: number;
  targetNode: NodeElement;
  initialPitch: string;
  initialLyric: string;
  initialDuration: number;
  trailingRestNode: NodeElement | null;
  canBreakLine: boolean;
  canFlowToPrev: boolean;
  canFlowToNext: boolean;
  prevLineEndNode?: NodeElement | null;
  prevSungNode?: NodeElement | null;
  lineEndSungNode?: NodeElement | null;
  currentSungPos: number;
  totalSungUnits: number;
}

export interface InteractiveSlideCanvasProps {
  slide: SheetSlide;
  prevSlide?: SheetSlide | null;
  nextSlide?: SheetSlide | null;
  slideNumber?: number;
  noteFontSize?: number;
  melodyText?: string;
  selectedUnit?: { lineIdx: number; nodeIdx: number } | null;
  onSelectUnit?: (context: SelectedUnitContext | null) => void;
  onBreakLine?: (
    targetNode: NodeElement,
    trailingRestNode?: NodeElement | null
  ) => void;
}

export function buildUnitContext(
  lineIdx: number,
  nodeIdx: number,
  slide: SheetSlide,
  prevSlide?: SheetSlide | null,
  nextSlide?: SheetSlide | null,
  lastChildIdx?: number,
  trailingRestForThisNode?: NodeElement | null,
  melodyText?: string
): SelectedUnitContext | null {
  const lines = [slide.line1, slide.line2].filter(Boolean) as OutputLine[];
  const line = lines[lineIdx];
  if (!line) return null;
  const targetNode = line.nodes[nodeIdx];
  if (!targetNode) return null;

  const curNote = targetNode.value instanceof Note ? (targetNode.value as Note) : null;
  let initialPitch = '';
  if (
    melodyText &&
    targetNode.melodySpan &&
    targetNode.melodySpan.start >= 0 &&
    targetNode.melodySpan.end <= melodyText.length
  ) {
    initialPitch = melodyText
      .slice(targetNode.melodySpan.start, targetNode.melodySpan.end)
      .trim();
  } else if (curNote) {
    initialPitch = curNote.toPitchString();
  }
  const initialLyric = targetNode.text || '';

  const endIdx = lastChildIdx !== undefined ? lastChildIdx : nodeIdx;
  let initialDuration = 1;
  if (curNote) {
    let durSum = curNote.duration.toNumber();
    for (let k = nodeIdx + 1; k <= endIdx; k++) {
      const child = line.nodes[k];
      if (
        child.type === NodeType.NOTE &&
        child.value instanceof Note &&
        child.value.tie[0]
      ) {
        durSum += child.value.duration.toNumber();
      }
    }
    initialDuration = durSum;
  }

  const sungUnitsOnLine: { node: NodeElement; idx: number }[] = [];
  line.nodes.forEach((n, idx) => {
    if (
      n.type === NodeType.NOTE &&
      !(n.value instanceof Note && n.value.tie[0]) &&
      !(n.value instanceof Note && n.value.isRest && !n.text)
    ) {
      sungUnitsOnLine.push({ node: n, idx });
    }
  });

  const currentSungPos = sungUnitsOnLine.findIndex((u) => u.idx === nodeIdx);
  const totalSungUnits = sungUnitsOnLine.length;
  const canBreakLine = currentSungPos > 0;

  let linePrev: OutputLine | null = null;
  let lineNext: OutputLine | null = null;
  if (lineIdx === 0) {
    linePrev =
      prevSlide && slide.sectionTag === null
        ? prevSlide.line2 || prevSlide.line1
        : null;
    lineNext =
      slide.line2
        ? slide.line2
        : nextSlide && nextSlide.sectionTag === null
        ? nextSlide.line1
        : null;
  } else {
    linePrev = slide.line1;
    lineNext =
      nextSlide && nextSlide.sectionTag === null ? nextSlide.line1 : null;
  }

  const lineEndSungNode =
    totalSungUnits > 0 ? sungUnitsOnLine[totalSungUnits - 1].node : null;

  const canFlowToNext = Boolean(lineNext && totalSungUnits > 0);
  let prevSungNode: NodeElement | null = null;
  if (canFlowToNext && currentSungPos > 0) {
    prevSungNode = sungUnitsOnLine[currentSungPos - 1].node;
  }

  let canFlowToPrev = Boolean(linePrev && totalSungUnits > 0);
  let prevLineEndNode: NodeElement | null = null;
  if (canFlowToPrev && linePrev) {
    const prevLineSungUnits = linePrev.nodes.filter(
      (n) =>
        n.type === NodeType.NOTE &&
        !(n.value instanceof Note && n.value.tie[0]) &&
        !(n.value instanceof Note && n.value.isRest && !n.text)
    );
    if (prevLineSungUnits.length > 0) {
      prevLineEndNode = prevLineSungUnits[prevLineSungUnits.length - 1];
    } else {
      canFlowToPrev = false;
    }
  }

  return {
    lineIdx,
    nodeIdx,
    targetNode,
    initialPitch,
    initialLyric,
    initialDuration,
    trailingRestNode: trailingRestForThisNode ?? null,
    canBreakLine,
    canFlowToPrev,
    canFlowToNext,
    prevLineEndNode,
    prevSungNode,
    lineEndSungNode,
    currentSungPos,
    totalSungUnits,
  };
}

export const InteractiveSlideCanvas: React.FC<InteractiveSlideCanvasProps> = ({
  slide,
  prevSlide,
  nextSlide,
  noteFontSize = 94,
  melodyText,
  selectedUnit = null,
  onSelectUnit,
  onBreakLine,
}) => {
  const [hoveredUnit, setHoveredUnit] = useState<{
    lineIdx: number;
    nodeIdx: number;
  } | null>(null);

  const W = SvgRenderer.SLIDE_WIDTH;
  const H = SvgRenderer.SLIDE_HEIGHT;
  const contentWidth = 888;
  const startX = 114;
  const lineYCoords = [225, 535];

  const { innerSvgContent, lines } = useMemo(() => {
    const renderer = new SvgRenderer();
    const baseSlideSvg = renderer.renderSlide(slide, noteFontSize);
    const content = baseSlideSvg
      .replace(/<\?xml.*?\?>/i, '')
      .replace(/<svg[^>]*>/i, '')
      .replace(/<\/svg>/i, '');
    const activeLines = [slide.line1, slide.line2].filter(Boolean) as OutputLine[];
    return { innerSvgContent: content, lines: activeLines };
  }, [slide, noteFontSize]);

  const isTiedContinuation = (n: NodeElement): boolean =>
    n.value instanceof Note && Boolean((n.value as Note).tie[0]);

  return (
    <div
      onClick={() => onSelectUnit?.(null)}
      className="relative w-full h-full flex flex-col items-center justify-center"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block select-none"
        xmlns="http://www.w3.org/2000/svg"
        onClick={() => onSelectUnit?.(null)}
      >
        <g dangerouslySetInnerHTML={{ __html: innerSvgContent }} />

        {lines.map((line, lineIdx) => {
          const lineY = lineYCoords[lineIdx];
          const layout = calculateLineLayout(line, contentWidth);
          const nodes = line.nodes;

          return (
            <g
              key={`line-interactive-${lineIdx}`}
              transform={`translate(${startX}, ${lineY})`}
            >
              {nodes.map((node, nodeIdx) => {
                if (
                  node.type === NodeType.DOT ||
                  node.type === NodeType.DASH ||
                  isTiedContinuation(node)
                ) {
                  return null;
                }

                let lastChildIdx = nodeIdx;
                while (lastChildIdx + 1 < nodes.length) {
                  const nextNode = nodes[lastChildIdx + 1];
                  if (
                    nextNode.type === NodeType.DOT ||
                    nextNode.type === NodeType.DASH ||
                    isTiedContinuation(nextNode)
                  ) {
                    lastChildIdx++;
                  } else {
                    break;
                  }
                }

                const isFirstUnit = !nodes
                  .slice(0, nodeIdx)
                  .some((n) => n.type === NodeType.NOTE && !isTiedContinuation(n));
                const isLastUnit = !nodes
                  .slice(lastChildIdx + 1)
                  .some((n) => n.type === NodeType.NOTE && !isTiedContinuation(n));

                const nodeStartX = layout.scaledNodePositions[nodeIdx];
                const nodeEndX = layout.scaledNodePositions[lastChildIdx];

                const halfNoteUnit = Math.round(noteFontSize * 0.68);
                const prevX =
                  !isFirstUnit && nodeIdx > 0
                    ? layout.scaledNodePositions[nodeIdx - 1]
                    : nodeStartX - halfNoteUnit * 2;
                const nextX =
                  !isLastUnit && lastChildIdx + 1 < nodes.length
                    ? layout.scaledNodePositions[lastChildIdx + 1]
                    : nodeEndX + halfNoteUnit * 2;

                let unitLeft = (nodeStartX + prevX) / 2;
                let unitRight = (nodeEndX + nextX) / 2;

                if (isFirstUnit) {
                  unitLeft = Math.min(unitLeft, nodeStartX - halfNoteUnit);
                }
                if (isLastUnit) {
                  unitRight = Math.max(unitRight, nodeEndX + halfNoteUnit);
                }

                const unitWidth = Math.max(30, unitRight - unitLeft);

                const isHovered =
                  hoveredUnit?.lineIdx === lineIdx &&
                  hoveredUnit?.nodeIdx === nodeIdx;
                const isSelected =
                  selectedUnit?.lineIdx === lineIdx &&
                  selectedUnit?.nodeIdx === nodeIdx;

                let restBeforeThisNode: NodeElement | null = null;
                for (let j = nodeIdx - 1; j >= 0; j--) {
                  if (nodes[j].value instanceof Note && (nodes[j].value as Note).isRest) {
                    restBeforeThisNode = nodes[j];
                  } else if (nodes[j].text) {
                    break;
                  }
                }

                // Fixed uniform unit box dimensions for notes with or without octave dots
                const boxY = -Math.round(noteFontSize * 1.30);
                const boxHeight = Math.round(noteFontSize * 3.55);

                const unitNote = node.value instanceof Note ? (node.value as Note) : null;
                const notePitchDesc = unitNote?.isRest ? '休止符' : `音符 ${unitNote?.toPitchString() || ''}`;
                const unitLabel = node.text ? `${notePitchDesc}，歌詞：${node.text}` : notePitchDesc;

                const handleSelect = (e: React.SyntheticEvent) => {
                  e.stopPropagation();
                  const ctx = buildUnitContext(
                    lineIdx,
                    nodeIdx,
                    slide,
                    prevSlide,
                    nextSlide,
                    lastChildIdx,
                    restBeforeThisNode,
                    melodyText
                  );
                  if (onSelectUnit && ctx) {
                    onSelectUnit(ctx);
                  }
                };

                return (
                  <g
                    key={`unit-${lineIdx}-${nodeIdx}`}
                    data-unit-selectable="true"
                    tabIndex={0}
                    role="button"
                    aria-label={unitLabel}
                    className="cursor-pointer focus:outline-none"
                    onMouseEnter={() => setHoveredUnit({ lineIdx, nodeIdx })}
                    onMouseLeave={() => setHoveredUnit(null)}
                    onFocus={() => setHoveredUnit({ lineIdx, nodeIdx })}
                    onBlur={() => setHoveredUnit(null)}
                    onClick={handleSelect}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(e);
                      }
                    }}
                  >
                    <rect
                      data-unit-selectable="true"
                      x={unitLeft}
                      y={boxY}
                      width={unitWidth}
                      height={boxHeight}
                      fill={
                        isSelected
                          ? 'rgba(56, 189, 248, 0.20)'
                          : isHovered
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'transparent'
                      }
                      stroke={
                        isSelected
                          ? '#38bdf8'
                          : isHovered
                          ? 'rgba(16, 185, 129, 0.8)'
                          : 'transparent'
                      }
                      strokeWidth={isSelected ? '2.5' : '2'}
                      strokeDasharray={isSelected ? 'none' : '4 3'}
                      rx="6"
                      style={{ pointerEvents: 'all' }}
                      className="cursor-pointer"
                    />

                    {node.text && isHovered && onBreakLine && !isFirstUnit && (
                      <g
                        className="cursor-pointer"
                        style={{ pointerEvents: 'all' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBreakLine(node, restBeforeThisNode);
                          onSelectUnit?.(null);
                        }}
                      >
                        <line
                          x1={unitLeft}
                          y1={boxY}
                          x2={unitLeft}
                          y2={boxY + boxHeight}
                          stroke="#f59e0b"
                          strokeWidth="3"
                        />
                        <rect
                          x={unitLeft - 14}
                          y={Math.round(noteFontSize * 0.55) - 14}
                          width={28}
                          height={28}
                          rx={14}
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        <text
                          x={unitLeft}
                          y={Math.round(noteFontSize * 0.55) + 5}
                          fill="#000000"
                          fontSize="15"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ pointerEvents: 'none' }}
                        >
                          ↵
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
