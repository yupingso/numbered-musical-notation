import React from 'react';

interface SlideCardProps {
  slideNumber: number;
  sectionTag: string | null;
  svgMarkup: string;
}

export const SlideCard: React.FC<SlideCardProps> = ({
  slideNumber,
  sectionTag,
  svgMarkup,
}) => {
  return (
    <div className="flex flex-col bg-[#0b0e17] border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/10 transition hover:border-slate-500">
      {/* High-Contrast Card Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/95 border-b border-slate-700 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-100">第 {slideNumber} 頁</span>
          {sectionTag && (
            <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-md border border-amber-500/40 shadow-sm">
              {sectionTag}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400 font-mono">4:3</span>
      </div>

      {/* 4:3 Slide Canvas (Pitch black frame inside elevated card) */}
      <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center p-3">
        <div
          className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
};
