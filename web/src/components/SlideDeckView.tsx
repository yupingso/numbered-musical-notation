import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SvgRenderer } from '../core/svgRenderer';

export interface SlideDeckStatus {
  valid: boolean;
  message: string;
  details?: string;
}

interface SlideDeckViewProps {
  slidesSvg: { slideIndex: number; sectionTag: string | null; svg: string }[];
  status?: SlideDeckStatus | null;
}

export const SlideDeckView: React.FC<SlideDeckViewProps> = ({
  slidesSvg,
  status,
}) => {
  // Aggregate all slides: Slide 1 (Title Card) + Slides 2..N+1 (Notation Slides)
  const allSlides = useMemo(() => {
    if (slidesSvg.length === 0) return [];
    return [
      {
        slideNumber: 1,
        sectionTag: '標題',
        svg: SvgRenderer.renderTitleSlideSvg(),
      },
      ...slidesSvg.map((s, idx) => ({
        slideNumber: idx + 2,
        sectionTag: s.sectionTag,
        svg: s.svg,
      })),
    ];
  }, [slidesSvg]);

  const totalSlides = allSlides.length;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pageInput, setPageInput] = useState('1');

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
  }, [goToSlide, currentSlideIndex]);

  const goToNext = useCallback(() => {
    goToSlide(currentSlideIndex + 1);
  }, [goToSlide, currentSlideIndex]);

  const goToFirst = useCallback(() => {
    goToSlide(0);
  }, [goToSlide]);

  const goToLast = useCallback(() => {
    goToSlide(totalSlides - 1);
  }, [goToSlide, totalSlides]);

  const handlePageInputCommit = () => {
    const val = parseInt(pageInput, 10);
    if (!isNaN(val)) {
      goToSlide(val - 1);
    } else {
      setPageInput(String(currentSlideIndex + 1));
    }
  };

  // Keyboard navigation (active when not typing in an input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
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

  // Mouse wheel throttling on slide viewport
  const lastWheelTimeRef = useRef<number>(0);
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 280) return;
    if (Math.abs(e.deltaY) < 25) return;

    if (e.deltaY > 0) {
      lastWheelTimeRef.current = now;
      goToNext();
    } else if (e.deltaY < 0) {
      lastWheelTimeRef.current = now;
      goToPrev();
    }
  };

  // Responsive 4:3 fit using ResizeObserver
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const padX = 16;
        const padY = 46;
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

  // Auto-scroll active thumbnail in bottom filmstrip (scoped to container)
  const filmstripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = filmstripRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>(
      `[data-slide-thumb="${currentSlideIndex}"]`
    );
    if (!activeEl) return;

    const targetLeft =
      activeEl.offsetLeft - (container.clientWidth - activeEl.clientWidth) / 2;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  }, [currentSlideIndex]);

  const currentSlide = allSlides[currentSlideIndex] ?? null;

  return (
    <div className="flex flex-col h-full bg-[#07090e] text-slate-100 select-none overflow-hidden">
      {/* Main Full-Page Slide Viewport */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        className="flex-1 relative flex flex-col items-center justify-center pt-10 pb-2 px-2.5 min-h-0 min-w-0 overflow-hidden bg-[#07090e]"
      >
        {/* Top Controls: Left-Aligned High-Contrast Navigation Bar & Accessible Section Tag */}
        {totalSlides > 0 && (
          <div className="absolute top-2 left-3 z-30 flex items-center gap-2">
            {/* Left-Aligned Presentation Navigator Bar (Tactile, high-contrast, compact) */}
            <div className="flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-lg p-1 shadow-xl shadow-black/80 shrink-0">
              {/* First Slide */}
              <button
                type="button"
                onClick={goToFirst}
                disabled={currentSlideIndex === 0}
                title="第一頁 (Home)"
                className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white bg-slate-700 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                ⏮
              </button>

              {/* Prev Slide */}
              <button
                type="button"
                onClick={goToPrev}
                disabled={currentSlideIndex === 0}
                title="上一頁 (← / PageUp)"
                className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white bg-slate-700 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                ◀
              </button>

              {/* Page Number Jump Input */}
              <div className="flex items-center gap-1 px-1 text-xs font-bold font-mono text-slate-200">
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
                  className="w-9 h-6 text-center bg-slate-950 border border-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 rounded text-white font-bold text-xs select-all shadow-inner"
                  title="輸入頁碼並按 Enter 跳轉"
                />
                <span className="text-slate-400">/</span>
                <span className="text-white text-xs font-bold min-w-[16px]">{totalSlides}</span>
              </div>

              {/* Next Slide */}
              <button
                type="button"
                onClick={goToNext}
                disabled={currentSlideIndex === totalSlides - 1}
                title="下一頁 (→ / PageDown / Space)"
                className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white bg-slate-700 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                ▶
              </button>

              {/* Last Slide */}
              <button
                type="button"
                onClick={goToLast}
                disabled={currentSlideIndex === totalSlides - 1}
                title="最後一頁 (End)"
                className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white bg-slate-700 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-30 disabled:bg-slate-800 disabled:text-slate-500 rounded border border-slate-600 hover:border-sky-400 transition cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                ⏭
              </button>
            </div>

            {/* Separately Drawn Section Tag Badge (High-contrast golden amber for high readability) */}
            {currentSlide?.sectionTag && (
              <div
                className="h-8 px-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-md border border-amber-300 flex items-center justify-center shrink-0 select-none transition"
                title={`當前段落：${currentSlide.sectionTag}`}
              >
                <span>{currentSlide.sectionTag}</span>
              </div>
            )}
          </div>
        )}

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
            <div
              className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none"
              dangerouslySetInnerHTML={{ __html: currentSlide?.svg ?? '' }}
            />
          </div>
        )}
      </div>

      {/* 3. Bottom Filmstrip / Thumbnails Bar */}
      {totalSlides > 0 && (
        <div className="h-[88px] bg-slate-900/95 border-t border-slate-800 flex items-center shrink-0 shadow-inner overflow-hidden">
          <div
            ref={filmstripRef}
            className="flex items-center gap-3 overflow-x-auto overflow-y-hidden w-full h-full px-5 py-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
          >
            {allSlides.map((slide, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <div
                  key={idx}
                  data-slide-thumb={idx}
                  onClick={() => goToSlide(idx)}
                  className={`h-16 aspect-[4/3] rounded-lg overflow-hidden shrink-0 cursor-pointer relative transition-all duration-150 transform ${
                    isActive
                      ? 'ring-2 ring-sky-400 border-sky-400 scale-[1.03] shadow-lg shadow-sky-950/60'
                      : 'border border-slate-700/80 opacity-60 hover:opacity-100 hover:scale-[1.01]'
                  } bg-black flex items-center justify-center`}
                  title={`跳至第 ${slide.slideNumber} 頁`}
                >
                  {/* Thumbnail Scaled SVG */}
                  <div
                    className="w-full h-full pointer-events-none [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                    dangerouslySetInnerHTML={{ __html: slide.svg }}
                  />

                  {/* Thumbnail Header Pill */}
                  <div className="absolute top-1 left-1 px-1.5 py-0.2 bg-slate-900/90 rounded text-[9px] font-bold text-slate-200 border border-slate-700/80">
                    {slide.slideNumber}
                  </div>

                  {slide.sectionTag && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.2 bg-amber-500/90 rounded text-[8px] font-bold text-black truncate max-w-[50px]">
                      {slide.sectionTag}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
