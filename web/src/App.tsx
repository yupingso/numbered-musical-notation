import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { InputContainer } from './components/InputContainer';
import { SlideDeckView, SlideDeckStatus } from './components/SlideDeckView';
import { SyntaxHelpOverlay, HelpType } from './components/SyntaxHelpOverlay';
import { parseClassicSong, parseSongMetadata } from './core/parserClassic';
import { SvgRenderer, splitAstIntoSlides } from './core/svgRenderer';
import { rasterizeSvgInBrowser } from './core/rasterizerWeb';
import { appendSlidesToPptx } from './core/pptxExporter';
import { MelodicUnit, NodeElement, SheetSlide, SongMetadata, SourceSpan } from './core/types';
import {
  isValidPitchString,
  modifyMelodicUnitDuration,
  performSynchronizedFlowToNext,
  performSynchronizedFlowToPrev,
  performSynchronizedLineBreak,
  performSynchronizedLineMerge,
  spliceBreakLyricGroup,
  spliceExpandLyricGroup,
  spliceLyricChar,
  spliceMelodyNoteDuration,
  spliceMelodyPitch,
  updateLyricsMetadata,
} from './core/sourceSplicer';
import {
  SavedSongFile,
  createNewSongTemplate,
  extractDisplayTitle,
  formatRelativeTime,
  generateSongFileId,
  getSongFileStem,
  isExactExampleSong,
  loadWorkspaceFromStorage,
  parseNmnSource,
  removeSavedSongFile,
  serializeNmnSource,
  syncAutoSaveFile,
} from './core/sourceFile';
import { EXAMPLE_SONG_01 } from './examples';

export const App: React.FC = () => {
  const [initialWorkspace] = useState(() => loadWorkspaceFromStorage());
  const [savedFiles, setSavedFiles] = useState<SavedSongFile[]>(
    () => initialWorkspace.savedFiles
  );
  const [activeFileId, setActiveFileId] = useState<string>(
    () => initialWorkspace.activeFileId
  );
  const [melodyText, setMelodyText] = useState<string>(
    () => initialWorkspace.initialMelody
  );
  const [lyricsText, setLyricsText] = useState<string>(
    () => initialWorkspace.initialLyrics
  );

  // Track which file IDs originated from the built-in example (initial load or "載入範例")
  const exampleSessionIdsRef = useRef<Set<string>>(
    new Set(
      !initialWorkspace.savedFiles.some((f) => f.id === initialWorkspace.activeFileId) &&
        isExactExampleSong(initialWorkspace.initialMelody, initialWorkspace.initialLyrics)
        ? [initialWorkspace.activeFileId]
        : []
    )
  );

  const [slidesSvg, setSlidesSvg] = useState<
    { slideIndex: number; sectionTag: string | null; sectionName?: string; svg: string }[]
  >([]);
  const [rawSlides, setRawSlides] = useState<SheetSlide[]>([]);
  const [metadata, setMetadata] = useState<SongMetadata>(() =>
    parseSongMetadata(initialWorkspace.initialLyrics, initialWorkspace.initialMelody)
  );
  const [alignmentStatus, setAlignmentStatus] = useState<SlideDeckStatus | null>(null);

  const [, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [activeHelp, setActiveHelp] = useState<HelpType | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [songModalMode, setSongModalMode] = useState<'new' | 'fork' | null>(null);
  const [newSongTitleInput, setNewSongTitleInput] = useState('');
  const [pendingDeleteFile, setPendingDeleteFile] = useState<SavedSongFile | null>(null);

  const importMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newSongInputRef = useRef<HTMLInputElement>(null);
  const confirmDeleteBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the title input when the "新增空白簡譜" / "建立副本" modal opens
  useEffect(() => {
    if (songModalMode) {
      const id = requestAnimationFrame(() => {
        newSongInputRef.current?.focus();
        newSongInputRef.current?.select();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [songModalMode]);

  // Focus the confirm button and handle Escape when the "Delete Saved Song" confirmation modal opens
  useEffect(() => {
    if (!pendingDeleteFile) return;
    const id = requestAnimationFrame(() => {
      confirmDeleteBtnRef.current?.focus();
    });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPendingDeleteFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [pendingDeleteFile]);

  // Close dropdown menus when clicking outside or pressing Escape
  useEffect(() => {
    if ((!isImportMenuOpen && !isExportMenuOpen) || pendingDeleteFile) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        isImportMenuOpen &&
        importMenuRef.current &&
        target &&
        !importMenuRef.current.contains(target)
      ) {
        setIsImportMenuOpen(false);
      }
      if (
        isExportMenuOpen &&
        exportMenuRef.current &&
        target &&
        !exportMenuRef.current.contains(target)
      ) {
        setIsExportMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsImportMenuOpen(false);
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isImportMenuOpen, isExportMenuOpen, pendingDeleteFile]);

  // Synchronous File-Like Auto-Save to localStorage
  useEffect(() => {
    setSavedFiles((prev) =>
      syncAutoSaveFile({
        savedFiles: prev,
        activeFileId,
        melody: melodyText,
        lyrics: lyricsText,
        isExampleSession: exampleSessionIdsRef.current.has(activeFileId),
      })
    );
  }, [activeFileId, melodyText, lyricsText]);

  const handleRender = useCallback(() => {
    startTransition(() => {
      try {
        const ast = parseClassicSong(melodyText, lyricsText);
        const slides = splitAstIntoSlides(ast.sections);
        const renderer = new SvgRenderer();

        const rendered = slides.map((s) => ({
          slideIndex: s.slideIndex,
          sectionTag: s.sectionTag,
          sectionName: s.sectionName || (s.sectionTag ?? undefined),
          svg: renderer.renderSlide(s),
        }));

        setRawSlides(slides);
        setSlidesSvg(rendered);
        setMetadata(ast.metadata ?? {});

        if (ast.errors && ast.errors.length > 0) {
          setAlignmentStatus({
            valid: false,
            message: ast.errors[0],
            details: ast.errors.join('\n'),
          });
        } else {
          setAlignmentStatus({
            valid: true,
            message: `${rendered.length} 頁簡譜 · ${ast.sections.length} 個段落`,
          });
        }
      } catch (err: any) {
        setAlignmentStatus({
          valid: false,
          message: '簡譜與歌詞對齊或解析失敗',
          details: err?.message || String(err),
        });
      }
    });
  }, [melodyText, lyricsText]);

  // Per-file Undo / Redo history for right-pane and programmatic edits
  const historyByFileRef = useRef<
    Map<
      string,
      {
        undo: { melodyText: string; lyricsText: string }[];
        redo: { melodyText: string; lyricsText: string }[];
      }
    >
  >(new Map());

  const getActiveFileHistory = useCallback(() => {
    let entry = historyByFileRef.current.get(activeFileId);
    if (!entry) {
      entry = { undo: [], redo: [] };
      historyByFileRef.current.set(activeFileId, entry);
    }
    return entry;
  }, [activeFileId]);

  // Record a snapshot of (melodyText, lyricsText) before applying a modification on activeFileId
  const recordHistory = useCallback(() => {
    const history = getActiveFileHistory();
    history.undo.push({ melodyText, lyricsText });
    if (history.undo.length > 50) {
      history.undo.shift();
    }
    history.redo = [];
  }, [getActiveFileHistory, melodyText, lyricsText]);

  const handleUndo = useCallback(() => {
    const history = getActiveFileHistory();
    if (history.undo.length === 0) return;
    const prev = history.undo.pop()!;
    history.redo.push({ melodyText, lyricsText });
    setMelodyText(prev.melodyText);
    setLyricsText(prev.lyricsText);
    setMetadata(parseSongMetadata(prev.lyricsText, prev.melodyText));
  }, [getActiveFileHistory, melodyText, lyricsText]);

  const handleRedo = useCallback(() => {
    const history = getActiveFileHistory();
    if (history.redo.length === 0) return;
    const next = history.redo.pop()!;
    history.undo.push({ melodyText, lyricsText });
    setMelodyText(next.melodyText);
    setLyricsText(next.lyricsText);
    setMetadata(parseSongMetadata(next.lyricsText, next.melodyText));
  }, [getActiveFileHistory, melodyText, lyricsText]);

  // Live render with 150ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      handleRender();
    }, 150);
    return () => clearTimeout(timer);
  }, [handleRender]);

  // Global shortcut listeners (Ctrl+Enter to re-render, Ctrl+Z to undo, Ctrl+Y / Ctrl+Shift+Z to redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleRender();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'TEXTAREA' ||
          (target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type === 'text'));

      // If actively typing inside a textarea/text-input, let the browser handle native text undo/redo
      if (isTextInput) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRender, handleUndo, handleRedo]);

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
        metadata,
      });

      const blob = new Blob([pptxBytes.buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${getSongFileStem(metadata, 'nmn_slides')}.pptx`;
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

  const handleDownloadSource = () => {
    const jsonContent = serializeNmnSource(melodyText, lyricsText);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${getSongFileStem(metadata, 'nmn_song')}.nmn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  const handleSubmitSongModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newSongTitleInput.trim();
    if (!trimmed || !songModalMode) return;

    const newId = generateSongFileId();
    if (songModalMode === 'fork') {
      const forkedLyrics = updateLyricsMetadata(lyricsText, { title: trimmed });
      setActiveFileId(newId);
      setLyricsText(forkedLyrics);
      setMetadata(parseSongMetadata(forkedLyrics, melodyText));
    } else {
      const { melody, lyrics } = createNewSongTemplate(trimmed);
      setActiveFileId(newId);
      setMelodyText(melody);
      setLyricsText(lyrics);
      setMetadata(parseSongMetadata(lyrics, melody));
    }

    setSongModalMode(null);
    setNewSongTitleInput('');
  };

  const handleImportSource = useCallback((newMelody: string, newLyrics: string) => {
    const newId = generateSongFileId();
    setActiveFileId(newId);
    setMelodyText(newMelody);
    setLyricsText(newLyrics);
    setMetadata(parseSongMetadata(newLyrics, newMelody));
  }, []);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        const parsed = parseNmnSource(content);
        handleImportSource(parsed.melody, parsed.lyrics);
      } catch (err: any) {
        alert(`匯入失敗: ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleSelectSavedFile = (file: SavedSongFile) => {
    setIsImportMenuOpen(false);
    if (file.id === activeFileId) return;
    setActiveFileId(file.id);
    setMelodyText(file.melody);
    setLyricsText(file.lyrics);
    setMetadata(parseSongMetadata(file.lyrics, file.melody));
  };

  const handleRequestDeleteSavedFile = (e: React.MouseEvent, file: SavedSongFile) => {
    e.stopPropagation();
    if (file.id === activeFileId) return;
    setPendingDeleteFile(file);
  };

  const handleConfirmDeleteSavedFile = () => {
    if (!pendingDeleteFile) return;
    if (pendingDeleteFile.id !== activeFileId) {
      setSavedFiles((prev) => removeSavedSongFile(prev, pendingDeleteFile.id));
    }
    setPendingDeleteFile(null);
  };

  const handleUpdateMetadata = useCallback(
    (newMeta: Partial<SongMetadata>) => {
      recordHistory();
      const updated = updateLyricsMetadata(lyricsText, newMeta);
      setLyricsText(updated);
      setMetadata((prev) => ({ ...prev, ...newMeta }));
    },
    [lyricsText, recordHistory]
  );

  const handleLoadExample = () => {
    const newId = generateSongFileId();
    exampleSessionIdsRef.current.add(newId);
    setActiveFileId(newId);
    setMelodyText(EXAMPLE_SONG_01.melody);
    setLyricsText(EXAMPLE_SONG_01.lyrics);
    setMetadata(parseSongMetadata(EXAMPLE_SONG_01.lyrics, EXAMPLE_SONG_01.melody));
  };

  const handleBreakLine = useCallback(
    (targetNode: NodeElement, trailingRestNode?: NodeElement | null) => {
      recordHistory();
      const result = performSynchronizedLineBreak(
        lyricsText,
        melodyText,
        targetNode,
        trailingRestNode
      );
      setLyricsText(result.lyricsText);
      setMelodyText(result.melodyText);
    },
    [lyricsText, melodyText, recordHistory]
  );

  const handleMergeLine = useCallback(
    (lineEndNode: NodeElement) => {
      recordHistory();
      const result = performSynchronizedLineMerge(
        lyricsText,
        melodyText,
        lineEndNode
      );
      setLyricsText(result.lyricsText);
      setMelodyText(result.melodyText);
    },
    [lyricsText, melodyText, recordHistory]
  );

  const handleFlowToNext = useCallback(
    (prevNode: NodeElement, lineEndNode: NodeElement) => {
      recordHistory();
      const result = performSynchronizedFlowToNext(
        lyricsText,
        melodyText,
        prevNode,
        lineEndNode
      );
      setLyricsText(result.lyricsText);
      setMelodyText(result.melodyText);
    },
    [lyricsText, melodyText, recordHistory]
  );

  const handleFlowToPrev = useCallback(
    (upToNode: NodeElement, prevLineEndNode: NodeElement) => {
      recordHistory();
      const result = performSynchronizedFlowToPrev(
        lyricsText,
        melodyText,
        upToNode,
        prevLineEndNode
      );
      setLyricsText(result.lyricsText);
      setMelodyText(result.melodyText);
    },
    [lyricsText, melodyText, recordHistory]
  );

  const handleEditLyric = useCallback(
    (target: NodeElement | SourceSpan, newChar: string) => {
      const span = 'start' in target ? target : target.lyricSpan;
      if (!span) return;
      recordHistory();
      const newLyrics = spliceLyricChar(lyricsText, span, newChar);
      setLyricsText(newLyrics);
    },
    [lyricsText, recordHistory]
  );

  const handleExpandGroup = useCallback(
    (unit: MelodicUnit) => {
      const rootSpan = unit.slurRootLyricSpan || unit.lyricSpan;
      if (!rootSpan) return;
      recordHistory();
      const newLyrics = spliceExpandLyricGroup(
        lyricsText,
        rootSpan,
        unit.slurSpans
      );
      setLyricsText(newLyrics);
    },
    [lyricsText, recordHistory]
  );

  const handleBreakGroup = useCallback(
    (unit: MelodicUnit) => {
      if (!unit.slurSpans || unit.slurSpans.length === 0) return;
      recordHistory();
      const newLyrics = spliceBreakLyricGroup(lyricsText, unit.slurSpans);
      setLyricsText(newLyrics);
    },
    [lyricsText, recordHistory]
  );

  const handleEditMelody = useCallback(
    (target: MelodicUnit | NodeElement, newDuration?: number, newPitch?: string) => {
      const unit = 'segments' in target ? target : undefined;
      const targetSpan = unit ? unit.melodySpan : target.melodySpan;
      if (!targetSpan && !unit) return;

      if (newPitch && !isValidPitchString(newPitch)) return;

      recordHistory();

      // If duration is not changed, perform an in-place pitch splice directly
      if (newDuration === undefined) {
        if (!newPitch) return;
        const newMelody = unit
          ? spliceMelodyPitch(melodyText, unit, newPitch)
          : spliceMelodyPitch(melodyText, targetSpan!, newPitch);
        setMelodyText(newMelody);
        return;
      }

      // Duration changed (with or without pitch change)
      let newMelody: string;
      if (unit) {
        newMelody = modifyMelodicUnitDuration(melodyText, unit, newDuration, newPitch);
      } else {
        newMelody = spliceMelodyNoteDuration(melodyText, targetSpan!, newDuration, newPitch);
      }

      setMelodyText(newMelody);
    },
    [melodyText, recordHistory]
  );

  const canExportPptx = !isExporting && slidesSvg.length > 0 && (alignmentStatus?.valid ?? true);
  const canExportSource = Boolean(melodyText.trim() || lyricsText.trim());

  return (
    <div className="flex flex-col h-dvh bg-[#05070e] text-slate-100 select-text overflow-hidden">
      {/* Hidden file input for importing .nmn source files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".nmn,.json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* Global Top Bar (Full Width, Modern High-Contrast Royal Navy Header) */}
      <header className="min-h-12 md:h-12 px-4 py-1.5 md:py-0 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 bg-[#0f1f38] border-b-2 border-sky-500/80 shadow-md shrink-0 z-30 relative">
        {/* Left: Branding & Import / Song Switcher Dropdown */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="Logo" className="w-6 h-6 shrink-0 rounded drop-shadow" />
            <span className="font-bold text-base tracking-wide text-white hidden sm:inline">
              簡譜投影片
            </span>
          </div>

          <div ref={importMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsImportMenuOpen((prev) => !prev);
                setIsExportMenuOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={isImportMenuOpen}
              className="px-3 py-1.5 bg-slate-700/90 hover:bg-slate-600 active:bg-slate-500 text-white text-sm font-semibold rounded-md border border-slate-500 transition flex items-center gap-1.5 select-none shadow-sm cursor-pointer"
              title="新增、匯入或切換最近儲存的簡譜"
            >
              <span>匯入</span>
              <svg
                className={`w-4 h-4 text-slate-200 transition-transform duration-150 ${
                  isImportMenuOpen ? 'rotate-180' : ''
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isImportMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-1.5 w-80 bg-slate-900 border border-slate-600/90 rounded-xl shadow-2xl py-2 z-50 flex flex-col select-none animate-in fade-in zoom-in-95 duration-100"
              >
                {/* 1. Create Blank Song (新增空白簡譜...) */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    setNewSongTitleInput('');
                    setSongModalMode('new');
                  }}
                  className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 transition flex items-start gap-3 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 text-sky-400 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">新增空白簡譜...</span>
                    <span className="text-xs text-slate-300">
                      輸入歌名並建立含主歌、副歌標籤的簡譜
                    </span>
                  </div>
                </button>

                {/* 2. Fork Current Song as New File (建立副本...) */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    const currentTitle =
                      extractDisplayTitle(lyricsText, melodyText) || '未命名簡譜';
                    setNewSongTitleInput(`${currentTitle} (副本)`);
                    setSongModalMode('fork');
                  }}
                  className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 transition flex items-start gap-3 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 text-sky-300 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">建立副本...</span>
                    <span className="text-xs text-slate-300">
                      複製目前簡譜內容並另存為新簡譜
                    </span>
                  </div>
                </button>

                <div className="my-1.5 border-t border-slate-800" />

                {/* 3. Import .nmn Source File */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 transition flex items-start gap-3 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 text-slate-200 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">匯入原始檔 (.nmn)</span>
                    <span className="text-xs text-slate-300">從電腦讀取已儲存的簡譜檔</span>
                  </div>
                </button>

                {/* 4. Load Built-in Example */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    handleLoadExample();
                  }}
                  className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 transition flex items-start gap-3 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 text-slate-200 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">載入範例</span>
                    <span className="text-xs text-slate-300">範例歌曲：你真偉大</span>
                  </div>
                </button>

                <div className="my-1.5 border-t border-slate-700/80" />

                {/* 5. Recently Saved Songs in localStorage */}
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 tracking-wide">
                    最近儲存的簡譜
                  </span>
                  <span className="text-xs text-slate-400">自動儲存</span>
                </div>

                {savedFiles.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-300 leading-relaxed">
                    尚無修改紀錄（新增或修改簡譜後將自動儲存於此）
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto flex flex-col divide-y divide-slate-800/60">
                    {savedFiles.map((file) => {
                      const isActive = file.id === activeFileId;
                      const displayTitle = file.title || '未命名簡譜';
                      return (
                        <div
                          key={file.id}
                          role="menuitem"
                          tabIndex={0}
                          onClick={() => handleSelectSavedFile(file)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectSavedFile(file);
                            }
                          }}
                          className={`px-4 py-2.5 flex items-center justify-between gap-2.5 transition cursor-pointer ${
                            isActive
                              ? 'bg-sky-950/50 hover:bg-sky-950/70'
                              : 'hover:bg-slate-800/90 active:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isActive ? 'bg-sky-400 shadow-sm shadow-sky-400' : 'bg-slate-500'
                              }`}
                            />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`text-sm font-bold truncate ${
                                    isActive ? 'text-sky-200' : 'text-slate-100'
                                  }`}
                                  title={displayTitle}
                                >
                                  {displayTitle}
                                </span>
                                {isActive && (
                                  <span className="px-1.5 py-0.5 bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-semibold rounded shrink-0">
                                    編輯中
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-300">
                                {formatRelativeTime(file.updatedAt)}
                              </span>
                            </div>
                          </div>

                          {!isActive && (
                            <button
                              type="button"
                              onClick={(e) => handleRequestDeleteSavedFile(e, file)}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-sm text-slate-300 hover:text-rose-200 hover:bg-rose-950/80 transition shrink-0 cursor-pointer"
                              title={`刪除「${displayTitle}」的儲存紀錄`}
                              aria-label={`刪除 ${displayTitle}`}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Live Validation Status Indicator in Flex Flow */}
        <div className="flex items-center justify-center flex-1 min-w-0 order-last w-full md:order-none md:w-auto">
          {alignmentStatus && (
            alignmentStatus.valid ? (
              <div className="flex items-center gap-1.5 px-3.5 py-1 bg-emerald-950/90 border border-emerald-500 text-emerald-100 text-sm rounded-full font-bold shadow-sm">
                <span className="text-emerald-400 font-bold text-sm">✓</span>
                <span>{alignmentStatus.message}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowErrorModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-amber-950/90 hover:bg-amber-900 border border-amber-500 text-amber-100 text-sm rounded-full font-bold shadow-sm transition cursor-pointer"
                title={alignmentStatus.details ? `${alignmentStatus.message}\n點擊查看錯誤詳情` : alignmentStatus.message}
              >
                <span className="text-amber-400 font-bold text-sm">⚠️</span>
                <span className="truncate">{alignmentStatus.message}</span>
                <span className="text-xs bg-amber-800 px-2 py-0.5 rounded text-white font-bold border border-amber-400 shrink-0">
                  詳情
                </span>
              </button>
            )
          )}
        </div>

        {/* Right: Export Dropdown */}
        <div ref={exportMenuRef} className="relative flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsExportMenuOpen((prev) => !prev);
              setIsImportMenuOpen(false);
            }}
            disabled={isExporting}
            aria-haspopup="menu"
            aria-expanded={isExportMenuOpen}
            className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-bold text-sm rounded-md shadow-md hover:shadow-sky-500/20 border border-sky-300/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:border-slate-600 disabled:text-slate-400 transition flex items-center gap-1.5 shrink-0 select-none cursor-pointer"
            title="匯出簡報 (.pptx) 或原始檔 (.nmn)"
          >
            {isExporting ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                <span>匯出中...</span>
              </>
            ) : (
              <>
                <span>匯出</span>
                <svg
                  className={`w-4 h-4 text-sky-100 transition-transform duration-150 ${
                    isExportMenuOpen ? 'rotate-180' : ''
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </>
            )}
          </button>

          {isExportMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1.5 w-72 bg-slate-900 border border-slate-600/90 rounded-xl shadow-2xl py-2 z-50 flex flex-col select-none animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!canExportPptx}
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleDownloadPptx();
                }}
                className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed transition flex items-start gap-3 cursor-pointer"
              >
                <svg
                  className="w-4 h-4 text-slate-200 mt-0.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-white">匯出簡報 (.pptx)</span>
                  <span className="text-xs text-slate-300">
                    {!canExportPptx
                      ? !(alignmentStatus?.valid ?? true)
                        ? `需先修正錯誤：${alignmentStatus?.message}`
                        : '無可匯出的投影片'
                      : '下載 4:3 PowerPoint 投影片'}
                  </span>
                </div>
              </button>

              <div className="my-1.5 border-t border-slate-800" />

              <button
                type="button"
                role="menuitem"
                disabled={!canExportSource}
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleDownloadSource();
                }}
                className="px-4 py-2.5 text-left hover:bg-slate-800 active:bg-slate-700 disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed transition flex items-start gap-3 cursor-pointer"
              >
                <svg
                  className="w-4 h-4 text-slate-200 mt-0.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-white">匯出原始檔 (.nmn)</span>
                  <span className="text-xs text-slate-300">
                    下載旋律與歌詞，供日後匯入編輯
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace (Responsive Dual Pane: side-by-side on md and up, stacked on mobile portrait) */}
      <main className="flex flex-col md:flex-row flex-1 min-h-0 min-w-0 overflow-y-auto md:overflow-hidden bg-[#05070e]">
        {/* Left Pane: Clean Input Area */}
        <section className="w-full md:w-[38%] md:min-w-[280px] md:max-w-[550px] h-[45vh] md:h-full min-h-[320px] md:min-h-0 flex flex-col min-w-0 border-b md:border-b-0 md:border-r border-slate-800/90 bg-[#070b14] shrink-0">
          <InputContainer
            melodyText={melodyText}
            setMelodyText={setMelodyText}
            lyricsText={lyricsText}
            setLyricsText={setLyricsText}
            onImportSource={handleImportSource}
            activeHelp={activeHelp}
            onToggleHelp={(type) => setActiveHelp((prev) => (prev === type ? null : type))}
          />
        </section>

        {/* Right Pane: Slide Deck Preview & Syntax Help Overlay */}
        <section className="relative flex-1 md:h-full min-h-[480px] md:min-h-0 overflow-hidden flex flex-col min-w-0">
          <SlideDeckView
            key={activeFileId}
            slidesSvg={slidesSvg}
            rawSlides={rawSlides}
            status={alignmentStatus}
            melodyText={melodyText}
            metadata={metadata}
            onUpdateMetadata={handleUpdateMetadata}
            onBreakLine={handleBreakLine}
            onMergeLine={handleMergeLine}
            onFlowToNext={handleFlowToNext}
            onFlowToPrev={handleFlowToPrev}
            onEditLyric={handleEditLyric}
            onEditMelody={handleEditMelody}
            onExpandGroup={handleExpandGroup}
            onBreakGroup={handleBreakGroup}
          />

          {activeHelp && (
            <SyntaxHelpOverlay
              type={activeHelp}
              onClose={() => setActiveHelp(null)}
            />
          )}
        </section>
      </main>

      {/* Create Blank Song / Fork Song Modal */}
      {songModalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSongModalMode(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSongModalMode(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-song-modal-title"
            onSubmit={handleSubmitSongModal}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-600/90 rounded-2xl shadow-2xl max-w-md w-full p-5 relative flex flex-col space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div
                id="new-song-modal-title"
                className="flex items-center gap-2 text-white font-bold text-base"
              >
                {songModalMode === 'fork' ? (
                  <svg
                    className="w-5 h-5 text-sky-400 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-sky-400 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
                <span>{songModalMode === 'fork' ? '建立副本' : '新增空白簡譜'}</span>
              </div>
              <button
                type="button"
                onClick={() => setSongModalMode(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition text-base cursor-pointer"
                title="關閉"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col space-y-2">
              <label
                htmlFor="new-song-title-input"
                className="text-sm font-semibold text-slate-200"
              >
                請輸入歌曲名稱：
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  ref={newSongInputRef}
                  id="new-song-title-input"
                  type="text"
                  value={newSongTitleInput}
                  onChange={(e) => setNewSongTitleInput(e.target.value)}
                  placeholder="例如：奇異恩典"
                  className="flex-1 min-w-0 px-3.5 py-2 bg-slate-950 border border-slate-700 focus:border-sky-400 rounded-lg text-base text-white placeholder-slate-500 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!newSongTitleInput.trim()}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg shadow-md border border-sky-400/50 transition shrink-0 cursor-pointer"
                >
                  確定
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete Saved Song Confirmation Modal */}
      {pendingDeleteFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPendingDeleteFile(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-song-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-rose-500/70 rounded-2xl shadow-2xl max-w-md w-full p-5 relative flex flex-col space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div
                id="delete-song-modal-title"
                className="flex items-center gap-2 text-rose-400 font-bold text-base"
              >
                <svg
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>刪除簡譜</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteFile(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition text-base cursor-pointer"
                title="關閉"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <p className="text-sm text-slate-100 leading-relaxed min-w-0 break-words">
                確定要刪除「
                <span className="font-bold text-white">
                  {pendingDeleteFile.title || '未命名簡譜'}
                </span>
                」嗎？
              </p>
              <button
                ref={confirmDeleteBtnRef}
                type="button"
                onClick={handleConfirmDeleteSavedFile}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-sm font-bold rounded-lg shadow-md border border-rose-400/50 transition shrink-0 cursor-pointer"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {showErrorModal && alignmentStatus && !alignmentStatus.valid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowErrorModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="error-modal-title"
            className="bg-slate-900 border border-amber-500/80 rounded-2xl shadow-2xl max-w-lg w-full p-5 relative flex flex-col space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div id="error-modal-title" className="flex items-center gap-2 text-amber-400 font-bold text-base">
                <span className="text-lg">⚠️</span>
                <span>{alignmentStatus.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowErrorModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition text-base cursor-pointer"
                title="關閉"
              >
                ✕
              </button>
            </div>

            {/* Error Details Monospace Block */}
            {alignmentStatus.details && (
              <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-4 font-mono text-sm text-amber-200 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                {alignmentStatus.details}
              </div>
            )}

            {/* Hint */}
            <div className="pt-1">
              <span className="text-sm text-slate-300">
                請依提示調整左側旋律或歌詞，投影片將自動更新。
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
