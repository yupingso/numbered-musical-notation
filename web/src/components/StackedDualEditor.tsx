import React from 'react';
import { HelpType } from './SyntaxHelpOverlay';

interface StackedDualEditorProps {
  melodyText: string;
  setMelodyText: (val: string) => void;
  lyricsText: string;
  setLyricsText: (val: string) => void;
  activeHelp: HelpType | null;
  onToggleHelp: (type: HelpType) => void;
}

export const StackedDualEditor: React.FC<StackedDualEditorProps> = ({
  melodyText,
  setMelodyText,
  lyricsText,
  setLyricsText,
  activeHelp,
  onToggleHelp,
}) => {
  const handleFileDrop = (
    e: React.DragEvent<HTMLDivElement>,
    setter: (val: string) => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setter(content);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="flex flex-col flex-1 gap-3 min-h-0">
      {/* 1. Melody Editor (Elevated with distinct border and shadow) */}
      <div
        className="flex flex-col flex-1 min-h-[140px] bg-[#0c1222] border border-slate-700/90 rounded-xl overflow-hidden shadow-xl shadow-black/50 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleFileDrop(e, setMelodyText)}
      >
        <div className="flex justify-between items-center px-3.5 py-2 bg-slate-800 border-b border-slate-700/80 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-400">
            <span>🎵</span>
            <span>旋律</span>
          </div>
          <button
            type="button"
            onClick={() => onToggleHelp('melody')}
            className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 select-none ${
              activeHelp === 'melody'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border border-transparent'
            }`}
            title="旋律輸入語法說明"
          >
            <span>❓</span>
            <span>說明</span>
          </button>
        </div>
        <textarea
          value={melodyText}
          onChange={(e) => setMelodyText(e.target.value)}
          placeholder="輸入簡譜音符，例如: <key> C, <time> 4/4, [555]_ | 3. ..."
          className="flex-1 w-full p-3.5 bg-transparent text-slate-100 font-mono text-xs md:text-sm resize-none focus:outline-none leading-relaxed selection:bg-amber-500/30"
          spellCheck={false}
        />
      </div>

      {/* 2. Lyrics Editor (Elevated with distinct border and shadow) */}
      <div
        className="flex flex-col flex-1 min-h-[140px] bg-[#0c1222] border border-slate-700/90 rounded-xl overflow-hidden shadow-xl shadow-black/50 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/40 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleFileDrop(e, setLyricsText)}
      >
        <div className="flex justify-between items-center px-3.5 py-2 bg-slate-800 border-b border-slate-700/80 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-sky-400">
            <span>📝</span>
            <span>歌詞</span>
          </div>
          <button
            type="button"
            onClick={() => onToggleHelp('lyrics')}
            className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 select-none ${
              activeHelp === 'lyrics'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 shadow-sm font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border border-transparent'
            }`}
            title="歌詞輸入語法說明"
          >
            <span>❓</span>
            <span>說明</span>
          </button>
        </div>
        <textarea
          value={lyricsText}
          onChange={(e) => setLyricsText(e.target.value)}
          placeholder="輸入歌詞，例如: <tag> 主歌, 主啊我神..."
          className="flex-1 w-full p-3.5 bg-transparent text-slate-100 font-mono text-xs md:text-sm resize-none focus:outline-none leading-relaxed selection:bg-sky-500/30"
          spellCheck={false}
        />
      </div>
    </div>
  );
};
