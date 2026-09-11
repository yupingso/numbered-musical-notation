import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { isValidPitchString, normalizePitchString } from '../core/sourceSplicer';
import { SvgRenderer } from '../core/svgRenderer';
import { NodeElement, Note, SheetSlide } from '../core/types';
import { InteractiveSlideCanvas, SelectedUnitContext } from './InteractiveSlideCanvas';

export interface SlideDeckStatus {
  valid: boolean;
  message: string;
  details?: string;
}

interface SlideDeckViewProps {
  slidesSvg: { slideIndex: number; sectionTag: string | null; sectionName?: string; svg: string }[];
  rawSlides?: SheetSlide[];
  status?: SlideDeckStatus | null;
  melodyText?: string;
  onBreakLine?: (
    targetNode: NodeElement,
    trailingRestNode?: NodeElement | null
  ) => void;
  onMergeLine?: (lineEndNode: NodeElement) => void;
  onFlowToNext?: (prevNode: NodeElement, lineEndNode: NodeElement) => void;
  onFlowToPrev?: (upToNode: NodeElement, prevLineEndNode: NodeElement) => void;
  onEditLyric?: (node: NodeElement, newChar: string) => void;
  onEditMelodyPitch?: (node: NodeElement, newPitch: string) => void;
  onEditMelodyDuration?: (node: NodeElement, newDuration: number, newPitch?: string) => void;
}

interface NoteInspectorBarProps {
  selectedUnit: SelectedUnitContext;
  onEditMelodyPitch?: (node: NodeElement, newPitch: string) => void;
  onEditMelodyDuration?: (
    node: NodeElement,
    newDuration: number,
    newPitch?: string
  ) => void;
  onEditLyric?: (node: NodeElement, newChar: string) => void;
  onClose: () => void;
}

const NoteInspectorBar: React.FC<NoteInspectorBarProps> = ({
  selectedUnit,
  onEditMelodyPitch,
  onEditMelodyDuration,
  onEditLyric,
  onClose,
}) => {
  const [editPitchVal, setEditPitchVal] = useState(selectedUnit.initialPitch);
  const [editLyricVal, setEditLyricVal] = useState(selectedUnit.initialLyric);
  const [editDurationVal, setEditDurationVal] = useState(String(selectedUnit.initialDuration));

  // Unit inspector validation and commit logic
  const isPitchValid = isValidPitchString(editPitchVal.trim());
  const lyricCodePoints = [...editLyricVal.trim()];
  const isLyricValid =
    (!selectedUnit.targetNode.text && editLyricVal.trim() === '') ||
    (lyricCodePoints.length === 1 &&
      !' ,.!?　。，、！？\r\n~'.includes(editLyricVal.trim()));
  const canCommit = isPitchValid && isLyricValid;

  const commitEdit = useCallback(() => {
    if (!canCommit) return;
    const targetNode = selectedUnit.targetNode;
    const pVal = normalizePitchString(editPitchVal.trim());
    const lVal = editLyricVal.trim();
    const dVal = parseFloat(editDurationVal);

    const isPitchChanged =
      Boolean(pVal) &&
      targetNode.value instanceof Note &&
      pVal !== selectedUnit.initialPitch;

    const isDurationChanged =
      !isNaN(dVal) &&
      dVal > 0 &&
      Math.abs(dVal - selectedUnit.initialDuration) > 1e-6;

    if (isDurationChanged && onEditMelodyDuration) {
      onEditMelodyDuration(targetNode, dVal, isPitchChanged ? pVal : undefined);
    } else if (
      isPitchChanged &&
      onEditMelodyPitch &&
      targetNode.value instanceof Note
    ) {
      onEditMelodyPitch(targetNode, pVal);
    }

    if (lVal && onEditLyric && targetNode.text && lVal !== selectedUnit.initialLyric) {
      onEditLyric(targetNode, lVal);
    }

    onClose();
  }, [
    canCommit,
    selectedUnit,
    editPitchVal,
    editLyricVal,
    editDurationVal,
    onEditMelodyDuration,
    onEditMelodyPitch,
    onEditLyric,
    onClose,
  ]);

  // Keyboard shortcut: Enter to commit if valid, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === 'Enter' && canCommit) {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canCommit, commitEdit, onClose]);

  return (
    <div className="flex flex-wrap items-center justify-between w-full min-w-0 gap-2">
      {/* Left: Note Properties (Pitch, Duration, Lyric) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Pitch */}
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-200 select-none">
          <span className="text-xs font-bold text-slate-300">音高</span>
          <input
            type="text"
            value={editPitchVal}
            placeholder="-"
            onChange={(e) => setEditPitchVal(normalizePitchString(e.target.value))}
            className={`w-10 h-6 px-1 text-center font-bold text-xs rounded border transition focus:outline-none ${
              !isPitchValid
                ? 'bg-rose-950/80 text-rose-200 border-rose-500 ring-1 ring-rose-500'
                : 'bg-black text-amber-300 border-amber-500/70 focus:border-amber-400'
            }`}
            title={!isPitchValid ? "無效音高！請輸入 0-7, #, $, ' 等簡譜音高記號" : '簡譜音高'}
          />
        </label>

        {/* Duration */}
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-200 select-none">
          <span className="text-xs font-bold text-slate-300">時值</span>
          <select
            value={editDurationVal}
            onChange={(e) => setEditDurationVal(e.target.value)}
            className="h-6 pl-1.5 pr-5 py-0 font-bold text-xs rounded border transition focus:outline-none cursor-pointer bg-black text-amber-300 border-amber-500/70 focus:border-amber-400"
            title="簡譜音符時值（拍數）"
          >
            {!['4', '3', '2', '1.5', '1', '0.75', '0.5', '0.25'].includes(
              editDurationVal
            ) && (
              <option value={editDurationVal} className="bg-slate-900 text-slate-100">
                {editDurationVal} 拍
              </option>
            )}
            <option value="4" className="bg-slate-900 text-slate-100">4 拍</option>
            <option value="3" className="bg-slate-900 text-slate-100">3 拍</option>
            <option value="2" className="bg-slate-900 text-slate-100">2 拍</option>
            <option value="1.5" className="bg-slate-900 text-slate-100">1.5 拍</option>
            <option value="1" className="bg-slate-900 text-slate-100">1 拍</option>
            <option value="0.75" className="bg-slate-900 text-slate-100">0.75 拍</option>
            <option value="0.5" className="bg-slate-900 text-slate-100">0.5 拍</option>
            <option value="0.25" className="bg-slate-900 text-slate-100">0.25 拍</option>
          </select>
        </label>

        {/* Lyric */}
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-200 select-none">
          <span className="text-xs font-bold text-slate-300">歌詞</span>
          <input
            type="text"
            value={editLyricVal}
            placeholder="-"
            onChange={(e) => setEditLyricVal(e.target.value)}
            className={`w-9 h-6 px-1 text-center font-bold text-xs rounded border transition focus:outline-none ${
              !isLyricValid
                ? 'bg-rose-950/80 text-rose-200 border-rose-500 ring-1 ring-rose-500'
                : 'bg-black text-white border-sky-500/70 focus:border-sky-400'
            }`}
            title={
              !isLyricValid
                ? lyricCodePoints.length > 1
                  ? '歌詞僅限單一字'
                  : '歌詞不能為空'
                : '歌詞單字'
            }
          />
        </label>
      </div>

      {/* Right: Actions (Commit / Cancel) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={!canCommit}
          onClick={commitEdit}
          className="h-6 px-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded border border-emerald-500/60 disabled:border-slate-700 transition cursor-pointer disabled:cursor-not-allowed shadow-sm shrink-0 flex items-center gap-1"
          title={
            !canCommit
              ? !isPitchValid
                ? '請輸入有效的簡譜音高'
                : '請輸入有效的單字歌詞'
              : '確定套用修改 (Enter)'
          }
        >
          <span>✓</span>
          <span>確定</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="h-6 px-2 bg-slate-800 hover:bg-rose-950/80 active:bg-rose-900 text-slate-300 hover:text-rose-200 font-semibold text-xs rounded border border-slate-600 hover:border-rose-500 transition cursor-pointer shrink-0 shadow-sm flex items-center gap-1"
          title="取消選取 (Esc)"
        >
          <span>✕</span>
          <span>取消</span>
        </button>
      </div>
    </div>
  );
};

export const SlideDeckView: React.FC<SlideDeckViewProps> = ({
  slidesSvg,
  rawSlides,
  status,
  melodyText,
  onBreakLine,
  onMergeLine,
  onFlowToNext,
  onFlowToPrev,
  onEditLyric,
  onEditMelodyPitch,
  onEditMelodyDuration,
}) => {
  // Aggregate all slides: Slide 1 (Title Card) + Slides 2..N+1 (Notation Slides)
  const allSlides = useMemo(() => {
    if (slidesSvg.length === 0) return [];
    return [
      {
        slideNumber: 1,
        sectionTag: '標題',
        sectionName: '標題',
        svg: SvgRenderer.renderTitleSlideSvg(),
      },
      ...slidesSvg.map((s, idx) => ({
        slideNumber: idx + 2,
        sectionTag: s.sectionTag,
        sectionName: s.sectionName ?? s.sectionTag,
        svg: s.svg,
      })),
    ];
  }, [slidesSvg]);

  const totalSlides = allSlides.length;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(1);
  const [pageInput, setPageInput] = useState('2');
  const [hasAutoAdvanced, setHasAutoAdvanced] = useState(false);

  // Unit selection state
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnitContext | null>(null);

  // Inspector toolbar ref for click-outside detection
  const inspectorRef = useRef<HTMLDivElement>(null);

  // Clear selection when navigating to another slide
  useEffect(() => {
    setSelectedUnit(null);
  }, [currentSlideIndex]);

  // Disable / dismiss unit focus when clicking outside inspector and outside unit nodes
  useEffect(() => {
    if (!selectedUnit) return;

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | SVGElement | null;
      if (!target) return;

      // 1. If clicking inside the Unit Inspector toolbar, do not deselect
      if (inspectorRef.current && inspectorRef.current.contains(target)) {
        return;
      }

      // 2. If clicking directly on a selectable unit node, let its own click handler select it
      if (target.closest('[data-unit-selectable]')) {
        return;
      }

      // 3. Otherwise (slide preview margin, melody/lyric textboxes, bottom filmstrip, etc.), deselect
      setSelectedUnit(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [selectedUnit]);

  // Auto-advance to slide 1 (first notation slide) on first load with content
  useEffect(() => {
    if (!hasAutoAdvanced && allSlides.length > 1) {
      setCurrentSlideIndex(1);
      setPageInput('2');
      setHasAutoAdvanced(true);
    }
  }, [allSlides.length, hasAutoAdvanced]);

  // Auto-clamp index when slide count changes
  useEffect(() => {
    if (totalSlides === 0) {
      setCurrentSlideIndex(0);
      setPageInput('1');
    } else if (currentSlideIndex >= totalSlides) {
      const newIdx = totalSlides - 1;
      setCurrentSlideIndex(newIdx);
      setPageInput(String(newIdx + 1));
    }
  }, [totalSlides, currentSlideIndex]);

  const goToSlide = useCallback(
    (index: number) => {
      if (totalSlides === 0) return;
      const clamped = Math.max(0, Math.min(totalSlides - 1, index));
      setCurrentSlideIndex(clamped);
      setPageInput(String(clamped + 1));
    },
    [totalSlides]
  );

  const goToPrev = useCallback(() => {
    goToSlide(currentSlideIndex - 1);
  }, [currentSlideIndex, goToSlide]);

  const goToNext = useCallback(() => {
    goToSlide(currentSlideIndex + 1);
  }, [currentSlideIndex, goToSlide]);

  const goToFirst = useCallback(() => {
    goToSlide(0);
  }, [goToSlide]);

  const goToLast = useCallback(() => {
    goToSlide(totalSlides - 1);
  }, [goToSlide, totalSlides]);

  const handlePageInputCommit = () => {
    const val = parseInt(pageInput.trim(), 10);
    if (!isNaN(val) && val >= 1 && val <= totalSlides) {
      goToSlide(val - 1);
    } else {
      setPageInput(String(currentSlideIndex + 1));
    }
  };

  const handleBreakLine = useCallback(() => {
    if (!selectedUnit || !selectedUnit.canBreakLine || !onBreakLine) return;
    onBreakLine(selectedUnit.targetNode, selectedUnit.trailingRestNode);
    setSelectedUnit(null);
  }, [selectedUnit, onBreakLine]);

  const handleFlowToPrev = useCallback(() => {
    if (!selectedUnit || !selectedUnit.canFlowToPrev || !selectedUnit.prevLineEndNode) return;
    if (selectedUnit.currentSungPos < selectedUnit.totalSungUnits - 1 && onFlowToPrev) {
      onFlowToPrev(selectedUnit.targetNode, selectedUnit.prevLineEndNode);
    } else if (onMergeLine) {
      onMergeLine(selectedUnit.prevLineEndNode);
    }
    setSelectedUnit(null);
  }, [selectedUnit, onFlowToPrev, onMergeLine]);

  const handleFlowToNext = useCallback(() => {
    if (!selectedUnit || !selectedUnit.canFlowToNext || !selectedUnit.lineEndSungNode) return;
    if (selectedUnit.currentSungPos > 0 && selectedUnit.prevSungNode && onFlowToNext) {
      onFlowToNext(selectedUnit.prevSungNode, selectedUnit.lineEndSungNode);
    } else if (onMergeLine) {
      onMergeLine(selectedUnit.lineEndSungNode);
    }
    setSelectedUnit(null);
  }, [selectedUnit, onFlowToNext, onMergeLine]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          target.blur();
          setSelectedUnit(null);
        }
        return;
      }

      if (e.key === 'Escape') {
        setSelectedUnit(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrev();
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === ' '
      ) {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToFirst();
      } else if (e.key === 'End') {
        e.preventDefault();
        goToLast();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, goToFirst, goToLast]);

  // Root reference for checking vertical scroll overflow
  const deckRootRef = useRef<HTMLDivElement>(null);

  // Mouse wheel slide navigation (with 250ms throttle)
  // Only active in desktop side-by-side layout (min-width: 768px) and when the view is not scrollable.
  // In stacked/mobile layouts (< 768px) or high zoom, wheel events must scroll the page naturally without scrolljacking.
  const lastWheelTimeRef = useRef(0);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // In stacked layout (< 768px) or when page is scrollable, do not intercept wheel events
      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) {
        return;
      }

      // Check if SlideDeckView itself currently has vertical scroll overflow
      const deckEl = deckRootRef.current;
      if (deckEl && deckEl.scrollHeight > deckEl.clientHeight + 4) {
        return;
      }

      const now = Date.now();
      if (now - lastWheelTimeRef.current < 250) return;
      if (e.deltaY > 0) {
        lastWheelTimeRef.current = now;
        goToNext();
      } else if (e.deltaY < 0) {
        lastWheelTimeRef.current = now;
        goToPrev();
      }
    },
    [goToNext, goToPrev]
  );

  // Viewport-based responsive 4:3 dimension calculation using ResizeObserver
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const padX = 16;
        const padY = 16;
        const availW = Math.max(120, width - padX);
        const availH = Math.max(90, height - padY);
        const targetRatio = 4 / 3;

        let slideW = availW;
        let slideH = availW / targetRatio;
        if (slideH > availH) {
          slideH = availH;
          slideW = availH * targetRatio;
        }

        setViewportDims({ w: Math.floor(slideW), h: Math.floor(slideH) });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll active thumbnail into view in filmstrip
  const filmstripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filmstripRef.current) return;
    const activeEl = filmstripRef.current.querySelector(
      `[data-slide-thumb="${currentSlideIndex}"]`
    ) as HTMLElement | null;
    if (activeEl) {
      const container = filmstripRef.current;
      const elLeft = activeEl.offsetLeft;
      const elWidth = activeEl.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = elLeft - (containerWidth - elWidth) / 2;
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [currentSlideIndex]);

  const currentSlide = allSlides[currentSlideIndex];

  return (
    <div
      ref={deckRootRef}
      className="flex flex-col h-full min-h-0 bg-[#05070e] text-slate-100 overflow-y-auto select-none"
    >
      {/* 1. Unified 2-Row Control Deck */}
      {totalSlides > 0 && (
        <div className="px-3 pt-3 shrink-0">
          <div
            ref={inspectorRef}
            className="bg-slate-900 border border-slate-700/90 rounded-xl overflow-hidden shadow-md z-20 flex flex-col select-none"
          >
            {/* Row 1: Slide Navigation & Section Context */}
            <div className="min-h-9 px-3 py-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700 rounded-lg p-0.5 shadow-sm">
                {/* First Slide */}
                <button
                  type="button"
                  onClick={goToFirst}
                  disabled={currentSlideIndex === 0}
                  aria-label="第一頁 (Home)"
                  title="第一頁 (Home)"
                  className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white bg-slate-700/80 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600/70 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                >
                  ⏮
                </button>

                {/* Prev Slide */}
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={currentSlideIndex === 0}
                  aria-label="上一頁 (← / PageUp)"
                  title="上一頁 (← / PageUp)"
                  className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white bg-slate-700/80 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600/70 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                >
                  ◀
                </button>

                {/* Page Number Jump Input */}
                <div className="flex items-center gap-1 px-1.5 text-xs font-bold font-mono text-slate-200">
                  <input
                    type="text"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={handlePageInputCommit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label="跳轉至指定頁碼"
                    className="w-8 h-5 text-center bg-slate-950 border border-slate-600 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 rounded text-white font-bold text-xs select-all shadow-inner focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                    title="輸入頁碼並按 Enter 跳轉"
                  />
                  <span className="text-slate-400">/</span>
                  <span className="text-white text-xs font-bold tabular-nums min-w-[1rem]">{totalSlides}</span>
                </div>

                {/* Next Slide */}
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={currentSlideIndex === totalSlides - 1}
                  aria-label="下一頁 (→ / PageDown / Space)"
                  title="下一頁 (→ / PageDown / Space)"
                  className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white bg-slate-700/80 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600/70 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                >
                  ▶
                </button>

                {/* Last Slide */}
                <button
                  type="button"
                  onClick={goToLast}
                  disabled={currentSlideIndex === totalSlides - 1}
                  aria-label="最後一頁 (End)"
                  title="最後一頁 (End)"
                  className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white bg-slate-700/80 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600/70 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                >
                  ⏭
                </button>
              </div>

              {/* Section Tag Badge */}
              {(currentSlide?.sectionName || currentSlide?.sectionTag) && (
                <div
                  className="h-6 px-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded shadow-sm border border-amber-300 flex items-center justify-center shrink-0 select-none transition"
                  title={`當前段落：${currentSlide.sectionName || currentSlide.sectionTag}`}
                >
                  <span>{currentSlide.sectionName || currentSlide.sectionTag}</span>
                </div>
              )}
            </div>

            {/* Right: Line Flow Operations (Part 2: when a unit is selected) */}
            {selectedUnit && (
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Break Line */}
                <button
                  type="button"
                  disabled={!selectedUnit.canBreakLine}
                  onClick={handleBreakLine}
                  className="h-6 px-1.5 bg-amber-950/80 hover:bg-amber-900 active:bg-amber-800 disabled:opacity-40 disabled:bg-slate-800/80 disabled:text-slate-500 text-amber-200 font-semibold text-xs rounded border border-amber-600/70 hover:border-amber-500 disabled:border-slate-700 transition cursor-pointer disabled:cursor-not-allowed shrink-0 flex items-center gap-1 shadow-sm focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
                  title={
                    selectedUnit.canBreakLine
                      ? '在此音符/字前方拆分為新行'
                      : '此音符為行首，無法在此處拆分'
                  }
                >
                  <span>↵</span>
                  <span>拆分</span>
                </button>

                {/* Flow / Merge to Prev */}
                <button
                  type="button"
                  disabled={!selectedUnit.canFlowToPrev}
                  onClick={handleFlowToPrev}
                  className="h-6 px-1.5 bg-sky-950/80 hover:bg-sky-900 active:bg-sky-800 disabled:opacity-40 disabled:bg-slate-800/80 disabled:text-slate-500 text-sky-200 font-semibold text-xs rounded border border-sky-600/70 hover:border-sky-500 disabled:border-slate-700 transition cursor-pointer disabled:cursor-not-allowed shrink-0 flex items-center gap-1 shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                  title={
                    selectedUnit.canFlowToPrev
                      ? '將此單元及其前方音符併入上一行'
                      : '前方無相鄰行可併入'
                  }
                >
                  <span>⬆</span>
                  <span>併入上行</span>
                </button>

                {/* Flow / Merge to Next */}
                <button
                  type="button"
                  disabled={!selectedUnit.canFlowToNext}
                  onClick={handleFlowToNext}
                  className="h-6 px-1.5 bg-sky-950/80 hover:bg-sky-900 active:bg-sky-800 disabled:opacity-40 disabled:bg-slate-800/80 disabled:text-slate-500 text-sky-200 font-semibold text-xs rounded border border-sky-600/70 hover:border-sky-500 disabled:border-slate-700 transition cursor-pointer disabled:cursor-not-allowed shrink-0 flex items-center gap-1 shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                  title={
                    selectedUnit.canFlowToNext
                      ? '將此單元及其後方音符併入下一行'
                      : '後方無相鄰行可併入'
                  }
                >
                  <span>⬇</span>
                  <span>併入下行</span>
                </button>
              </div>
            )}
          </div>

          {/* Row 2: Note Editing Ribbon / Guidance Bar */}
          <div className="min-h-9 px-3 py-1 flex flex-wrap items-center gap-y-1.5 bg-slate-950/40">
            {!selectedUnit ? (
              /* State A: Idle Guidance */
              <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium select-text cursor-text">
                <span className="text-amber-400 font-bold text-sm select-none">💡</span>
                <span>點選簡報中的音符以調整音高、時值與換行</span>
                <span className="text-slate-300 text-xs ml-2 select-text">
                  (快捷鍵：<kbd className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded border border-slate-600 font-mono text-xs font-semibold select-text">Enter</kbd> 確定 · <kbd className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded border border-slate-600 font-mono text-xs font-semibold select-text">Esc</kbd> 取消)
                </span>
              </div>
            ) : (
              /* State B: Note Inspector Active */
              <NoteInspectorBar
                key={`inspector-${selectedUnit.lineIdx}-${selectedUnit.nodeIdx}-${selectedUnit.targetNode.melodySpan?.start ?? ''}`}
                selectedUnit={selectedUnit}
                onEditMelodyPitch={onEditMelodyPitch}
                onEditMelodyDuration={onEditMelodyDuration}
                onEditLyric={onEditLyric}
                onClose={() => setSelectedUnit(null)}
              />
            )}
          </div>
        </div>
        </div>
      )}

      {/* 2. Main Slide Viewport Area (100% Unobstructed) */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="flex-1 relative flex flex-col items-center justify-center p-3 min-h-0 min-w-0 overflow-hidden bg-[#07090e]"
      >
        {totalSlides === 0 ? (
          status && !status.valid ? (
            <div className="flex flex-col items-center justify-center p-8 text-amber-400 space-y-3 max-w-md mx-auto text-center">
              <span className="text-4xl">⚠️</span>
              <div className="font-bold text-sm text-amber-200">{status.message}</div>
              {status.details && (
                <div className="text-xs text-amber-200/90 font-mono bg-amber-950/40 p-3.5 rounded-xl border border-amber-700/60 w-full text-left break-all leading-relaxed shadow-lg whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {status.details}
                </div>
              )}
              <p className="text-xs text-slate-400">請依提示調整左側旋律或歌詞，預覽將自動重新整理。</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400 space-y-2 text-center">
              <span className="text-4xl">🎵</span>
              <p className="text-sm font-semibold text-slate-300">簡譜投影片預覽</p>
              <p className="text-xs text-slate-500">輸入旋律與歌詞後，此處將自動產生全頁簡報預覽。</p>
            </div>
          )
        ) : (
          /* Centered 4:3 Slide Display Card */
          <div
            style={{ width: `${viewportDims.w}px`, height: `${viewportDims.h}px` }}
            className="relative bg-black rounded-xl overflow-hidden shadow-2xl shadow-black/90 border-2 border-slate-500 flex items-center justify-center transition"
          >
            {currentSlideIndex === 0 ? (
              <div
                className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none"
                dangerouslySetInnerHTML={{ __html: currentSlide?.svg ?? '' }}
              />
            ) : !rawSlides || !rawSlides[currentSlideIndex - 1] ? (
              <div
                className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none"
                dangerouslySetInnerHTML={{ __html: currentSlide?.svg ?? '' }}
              />
            ) : (
              <InteractiveSlideCanvas
                key={`slide-${currentSlideIndex}`}
                slide={rawSlides[currentSlideIndex - 1]}
                prevSlide={currentSlideIndex > 1 ? rawSlides[currentSlideIndex - 2] : null}
                nextSlide={
                  currentSlideIndex < rawSlides.length
                    ? rawSlides[currentSlideIndex]
                    : null
                }
                slideNumber={currentSlideIndex + 1}
                melodyText={melodyText}
                selectedUnit={selectedUnit}
                onSelectUnit={setSelectedUnit}
                onBreakLine={onBreakLine}
              />
            )}
          </div>
        )}
      </div>

      {/* 3. Bottom Filmstrip / Thumbnails Bar */}
      {totalSlides > 0 && (
        <div className="hidden [@media(min-height:500px)]:flex h-[5.5rem] [@media(max-height:700px)]:h-12 bg-slate-900/95 border-t border-slate-800 items-center shrink-0 shadow-inner overflow-hidden py-1 [@media(max-height:700px)]:py-0.5">
          <div
            ref={filmstripRef}
            tabIndex={0}
            role="region"
            aria-label="投影片縮圖"
            className="flex items-center gap-3 [@media(max-height:700px)]:gap-2 overflow-x-auto overflow-y-hidden w-full h-full px-5 [@media(max-height:700px)]:px-3 py-2 [@media(max-height:700px)]:py-1 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          >
            {allSlides.map((slide, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <button
                  type="button"
                  key={idx}
                  data-slide-thumb={idx}
                  onClick={() => goToSlide(idx)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`第 ${slide.slideNumber} 頁`}
                  className={`h-16 [@media(max-height:700px)]:h-9 aspect-[4/3] rounded-lg overflow-hidden shrink-0 cursor-pointer relative transition-all duration-150 transform text-left p-0 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
                    isActive
                      ? 'ring-2 ring-sky-400 scale-105 shadow-lg shadow-sky-500/20'
                      : 'opacity-70 hover:opacity-100 hover:scale-105 border border-slate-700'
                  }`}
                >
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none bg-black"
                    dangerouslySetInnerHTML={{ __html: slide.svg }}
                  />
                  {/* Thumbnail Header Pill */}
                  <div className="absolute top-1 left-1 [@media(max-height:700px)]:top-0.5 [@media(max-height:700px)]:left-0.5 px-1.5 py-0.5 [@media(max-height:700px)]:px-1 [@media(max-height:700px)]:py-0 bg-slate-900/90 rounded text-xs [@media(max-height:700px)]:text-[10px] font-bold text-slate-200 border border-slate-700/80 leading-tight">
                    {slide.slideNumber}
                  </div>

                  {slide.sectionTag && (
                    <div className="absolute bottom-1 right-1 [@media(max-height:700px)]:hidden px-1.5 py-0.5 bg-amber-500/90 rounded text-xs font-bold text-black truncate max-w-[4rem]">
                      {slide.sectionTag}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
