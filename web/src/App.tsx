import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { InputContainer } from './components/InputContainer';
import { SlideDeckView, SlideDeckStatus } from './components/SlideDeckView';
import { SyntaxHelpOverlay, HelpType } from './components/SyntaxHelpOverlay';
import { parseClassicSong } from './core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from './core/svgRenderer';
import { rasterizeSvgInBrowser } from './core/rasterizerWeb';
import { appendSlidesToPptx } from './core/pptxExporter';
import { EXAMPLE_SONG_01 } from './examples';

export const App: React.FC = () => {
  const [melodyText, setMelodyText] = useState<string>(() => {
    return localStorage.getItem('nmn_melody') || EXAMPLE_SONG_01.melody;
  });
  const [lyricsText, setLyricsText] = useState<string>(() => {
    return localStorage.getItem('nmn_lyrics') || EXAMPLE_SONG_01.lyrics;
  });

  const [slidesSvg, setSlidesSvg] = useState<
    { slideIndex: number; sectionTag: string | null; svg: string }[]
  >([]);
  const [alignmentStatus, setAlignmentStatus] = useState<SlideDeckStatus | null>(null);

  const [, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [activeHelp, setActiveHelp] = useState<HelpType | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem('nmn_melody', melodyText);
  }, [melodyText]);

  useEffect(() => {
    localStorage.setItem('nmn_lyrics', lyricsText);
  }, [lyricsText]);

  const handleRender = useCallback(() => {
    startTransition(() => {
      try {
        const ast = parseClassicSong(melodyText, lyricsText);
        const slides = splitAstIntoSlides(ast.sections);
        const renderer = new SvgRenderer();

        const rendered = slides.map((s) => ({
          slideIndex: s.slideIndex,
          sectionTag: s.sectionTag,
          svg: renderer.renderSlide(s),
        }));

        setSlidesSvg(rendered);
        setAlignmentStatus({
          valid: true,
          message: `${rendered.length} 頁簡譜 · ${ast.sections.length} 個段落`,
        });
      } catch (err: any) {
        setAlignmentStatus({
          valid: false,
          message: '簡譜與歌詞對齊或解析失敗',
          details: err?.message || String(err),
        });
      }
    });
  }, [melodyText, lyricsText]);

  // Live render with 150ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      handleRender();
    }, 150);
    return () => clearTimeout(timer);
  }, [handleRender]);

  // Global Ctrl+Enter shortcut (triggers immediate render)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRender();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRender]);

  const handleDownloadPptx = async () => {
    if (slidesSvg.length === 0) return;
    setIsExporting(true);
    try {
      const templateRes = await fetch('./template.pptx');
      if (!templateRes.ok) {
        throw new Error('無法載入 template.pptx');
      }
      const templateBuffer = await templateRes.arrayBuffer();

      const pngImages: Uint8Array[] = [];
      for (const s of slidesSvg) {
        const png = await rasterizeSvgInBrowser(s.svg, 2048, 1536);
        pngImages.push(png);
      }

      const pptxBytes = await appendSlidesToPptx({
        templateData: templateBuffer,
        slidePngImages: pngImages,
      });

      const blob = new Blob([pptxBytes.buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'worship_nmn_slides.pptx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(`匯出失敗: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleLoadExample = () => {
    setMelodyText(EXAMPLE_SONG_01.melody);
    setLyricsText(EXAMPLE_SONG_01.lyrics);
  };

  return (
    <div className="flex flex-col h-screen bg-[#05070e] text-slate-100 overflow-hidden select-text">
      {/* Global Top Bar (Full Width, h-12, Modern High-Contrast Royal Navy Header) */}
      <header className="h-12 px-4 flex items-center justify-between bg-[#0f1f38] border-b-2 border-sky-500/80 shadow-md shrink-0 z-20 relative">
        {/* Left: Branding & Example Loader */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="Logo" className="w-6 h-6 shrink-0 rounded drop-shadow" />
            <span className="font-bold text-sm tracking-wide text-white hidden sm:inline">
              詩歌投影片
            </span>
          </div>

          <button
            type="button"
            onClick={handleLoadExample}
            className="px-2.5 py-1 bg-slate-700/90 hover:bg-slate-600 active:bg-slate-500 text-white text-xs font-semibold rounded-md border border-slate-500 transition flex items-center gap-1.5 select-none shadow-sm cursor-pointer"
            title="載入範例詩歌 (你真偉大)"
          >
            <span>📄</span>
            <span>載入範例</span>
          </button>
        </div>

        {/* Center: Live Validation Status Indicator (True Viewport Center) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          {alignmentStatus && (
            alignmentStatus.valid ? (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/90 border border-emerald-500 text-emerald-100 text-xs rounded-full font-bold shadow-sm">
                <span className="text-emerald-400 font-bold text-sm">✓</span>
                <span>{alignmentStatus.message}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowErrorModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/90 hover:bg-amber-900 border border-amber-500 text-amber-100 text-xs rounded-full font-bold shadow-sm transition cursor-pointer"
                title={alignmentStatus.details ? `${alignmentStatus.message}\n點擊查看錯誤詳情` : alignmentStatus.message}
              >
                <span className="text-amber-400 font-bold text-sm">⚠️</span>
                <span className="truncate max-w-[240px]">{alignmentStatus.message}</span>
                <span className="text-[10px] bg-amber-800 px-1.5 py-0.2 rounded text-white font-bold border border-amber-400">
                  詳情
                </span>
              </button>
            )
          )}
        </div>

        {/* Right: Export PPTX Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPptx}
            disabled={isExporting || slidesSvg.length === 0 || !(alignmentStatus?.valid ?? true)}
            className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-bold text-xs rounded-md shadow-md hover:shadow-sky-500/20 border border-sky-300/50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shrink-0 select-none cursor-pointer"
            title="下載 OpenXML .pptx 簡報檔案"
          >
            {isExporting ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>匯出中...</span>
              </>
            ) : (
              <>
                <span className="text-sm">📥</span>
                <span>下載</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace (Dual Pane Layout below Global Top Bar) */}
      <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden bg-[#05070e]">
        {/* Left Pane: Clean Input Area (Maximized height without redundant header) */}
        <section className="w-[42%] min-w-[380px] max-w-[600px] h-full flex flex-col border-r border-slate-800/90 bg-[#070b14]">
          <InputContainer
            melodyText={melodyText}
            setMelodyText={setMelodyText}
            lyricsText={lyricsText}
            setLyricsText={setLyricsText}
            activeHelp={activeHelp}
            onToggleHelp={(type) => setActiveHelp((prev) => (prev === type ? null : type))}
          />
        </section>

        {/* Right Pane: Slide Deck Preview & Syntax Help Overlay */}
        <section className="relative flex-1 h-full overflow-hidden flex flex-col min-w-0">
          <SlideDeckView
            slidesSvg={slidesSvg}
            status={alignmentStatus}
          />

          {activeHelp && (
            <SyntaxHelpOverlay
              type={activeHelp}
              onClose={() => setActiveHelp(null)}
            />
          )}
        </section>
      </main>

      {/* Error Details Modal */}
      {showErrorModal && alignmentStatus && !alignmentStatus.valid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowErrorModal(false)}
        >
          <div
            className="bg-slate-900 border border-amber-500/80 rounded-2xl shadow-2xl max-w-lg w-full p-5 relative flex flex-col space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <span className="text-lg">⚠️</span>
                <span>{alignmentStatus.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowErrorModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm cursor-pointer"
                title="關閉"
              >
                ✕
              </button>
            </div>

            {/* Error Details Monospace Block */}
            {alignmentStatus.details && (
              <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-4 font-mono text-xs text-amber-200 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                {alignmentStatus.details}
              </div>
            )}

            {/* Hint */}
            <div className="pt-1">
              <span className="text-xs text-slate-400">
                請依提示調整左側旋律或歌詞，投影片將自動更新。
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
