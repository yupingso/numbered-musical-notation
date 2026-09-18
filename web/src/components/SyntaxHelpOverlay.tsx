import React, { useEffect } from 'react';

export type HelpType = 'melody' | 'lyrics';

interface SyntaxHelpOverlayProps {
  type: HelpType;
  onClose: () => void;
}

export const SyntaxHelpOverlay: React.FC<SyntaxHelpOverlayProps> = ({ type, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="syntax-help-title"
        className="relative w-full max-w-xl max-h-[90vh] bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl shadow-black/90 flex flex-col overflow-hidden ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Card Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700 shrink-0">
          <div id="syntax-help-title" className="flex items-center gap-2 text-base font-bold text-slate-100">
            {type === 'melody' ? (
              <>
                <span className="text-amber-400">🎵</span>
                <span>旋律說明</span>
              </>
            ) : (
              <>
                <span className="text-sky-400">📝</span>
                <span>歌詞說明</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white px-2.5 py-1 rounded-lg hover:bg-slate-700/80 transition text-sm flex items-center gap-1"
            title="關閉說明 (Esc 或點擊背景)"
          >
            <span>✕</span>
            <span>關閉</span>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-slate-100">
          {type === 'melody' ? (
            <>
              {/* Section 1: 調號/拍號/小節 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-1.5">
                  <svg
                    viewBox="4.2 8.8 31.8 89.6"
                    className="w-4 h-4 fill-current text-purple-400 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M36.0,64.5Q36.0,73.4 27.8,76.5Q27.9,77.0 29.1,82.9Q30.0,86.8 30.0,89.4Q30.0,93.4 27.2,95.9Q24.5,98.4 20.5,98.4Q16.9,98.4 14.2,96.4Q11.3,94.2 11.3,90.8Q11.3,88.6 12.8,86.6Q14.3,84.7 16.5,84.7Q18.6,84.7 20.1,86.3Q21.5,87.9 21.5,90.0Q21.5,94.7 16.3,94.7Q17.6,96.7 20.5,96.7Q23.0,96.7 25.1,95.4Q28.2,93.4 28.2,88.4Q28.2,86.6 26.1,77.1Q24.0,77.6 22.0,77.6Q14.8,77.6 9.5,72.1Q4.2,66.6 4.2,59.3Q4.2,53.0 8.7,46.5Q11.3,42.8 18.0,36.1Q16.3,30.2 16.3,24.9Q16.3,20.6 17.5,16.5Q19.0,11.5 21.8,9.5Q22.8,8.8 23.7,8.8Q24.6,8.8 25.4,9.8Q29.4,14.5 29.4,23.2Q29.4,35.4 21.0,43.2L22.8,51.9Q24.1,51.7 25.0,51.7Q29.9,51.7 33.0,55.8Q36.0,59.5 36.0,64.5ZM27.3,20.4Q27.3,16.2 24.8,16.2Q21.7,16.2 19.8,21.5Q18.3,25.6 18.3,29.5Q18.3,32.3 19.4,34.9Q22.2,33.2 24.7,28.4Q27.3,23.7 27.3,20.4ZM32.5,67.0Q32.5,63.1 30.2,60.5Q27.8,57.9 23.9,57.9L27.3,74.9Q32.5,72.7 32.5,67.0ZM25.8,75.4L22.3,58.1Q20.2,58.7 18.5,60.7Q16.9,62.7 16.9,64.8Q16.9,67.7 19.2,69.6Q21.4,71.5 21.4,71.3L20.8,71.7Q17.8,70.9 15.9,68.4Q13.9,66.0 13.9,62.8Q13.9,59.6 16.0,56.5Q18.1,53.5 21.1,52.3L19.6,44.4Q7.9,54.2 7.9,63.4Q7.9,68.8 12.0,72.5Q16.0,76.2 21.4,76.2Q22.7,76.2 25.8,75.4Z" />
                  </svg>
                  <span>調號/拍號/小節</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">調號</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-purple-300 font-mono font-bold rounded border border-slate-700">&lt;key&gt; C</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">拍號</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-purple-300 font-mono font-bold rounded border border-slate-700">&lt;time&gt; 4/4</kbd>
                  </div>
                  <div className="sm:col-span-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100 font-medium">小節線</span>
                      <kbd className="px-2 py-0.5 bg-slate-800 text-purple-300 font-mono font-bold rounded border border-slate-700">| 1 2 3 4 |</kbd>
                    </div>
                    <p className="text-slate-200 text-sm leading-relaxed">
                      只需在旋律開頭標示第一個 <code className="text-purple-300">|</code>（定位第一小節與弱起拍），後續的小節線 <code className="text-purple-300">|</code> 皆可省略，系統會依拍號自動切分小節。
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: 音高 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                  <span>🎵</span>
                  <span>音高</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">基本音符</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">1 ~ 7</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">休止符</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">0</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">高音</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">1'</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">低音</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">5,</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">升記號</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">#4</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">降記號</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">$7</kbd>
                  </div>
                </div>
              </div>

              {/* Section 3: 時值 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                  <span>⏱️</span>
                  <span>時值</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">延音</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">1 - - -</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">附點</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">3.</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">八分音符</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">5_</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">十六分音符</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">5=</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">連音群組</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">[5 5 5]_</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-100 font-medium">同音連結線</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">3~ 3</kbd>
                  </div>
                  <div className="sm:col-span-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-slate-100 font-medium">同音連結線 <code className="text-sky-300">~</code> 說明</div>
                    <p className="text-slate-200 text-sm leading-relaxed">
                      旋律中的 <code className="text-sky-300">~</code> 會將兩個<strong>相同音高</strong>的音符合併延長（包含跨小節 <code className="text-sky-300">3~ | 3</code>），只配對一個歌詞字。若要「一字唱多個不同音高」，請改在<strong>歌詞</strong>區加 <code className="text-sky-300">~</code>（或點右側音符按「🔗 連音」）。
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Section 1: 分行與換頁 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                  <span>📑</span>
                  <span>分行與換頁</span>
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-slate-100 font-medium">投影片分行（核心概念）</div>
                    <p className="text-slate-200 text-sm leading-relaxed">
                      投影片上的每一行簡譜，完全由<strong>歌詞的換行</strong>決定。系統會依照每行歌詞的字數，自動從旋律依序取出對應數量的音符排成一行；每張投影片最多顯示兩行。
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-slate-100 font-medium">段落標籤</div>
                      <div className="text-slate-200 text-sm">自動將不同段落換至新的投影片，並顯示於投影片左上角</div>
                    </div>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">
                      &lt;tag&gt; 主歌 1
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Section 2: 字音對齊 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                  <span>🔤</span>
                  <span>字音對齊</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100 font-medium">單字對齊</span>
                      <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">一字一音</kbd>
                    </div>
                    <p className="text-slate-200 text-sm">每個中文字或英文單字依序自動對齊一個音符。</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100 font-medium">一字多音</span>
                      <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">神~~</kbd>
                    </div>
                    <p className="text-slate-200 text-sm">字後加 <code className="text-amber-300">~</code> 連唱多個音（<code className="text-amber-300">神~~</code> 代表連唱 3 個音），也可點右側音符按「🔗 連音」。</p>
                  </div>
                </div>
              </div>

              {/* Section 3: 標點符號 */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-1.5">
                  <span>✍️</span>
                  <span>標點符號</span>
                </h3>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5 text-sm">
                  <div className="text-slate-100 font-medium">標點自動忽略</div>
                  <p className="text-slate-200 text-sm leading-relaxed">
                    空白、逗號、句號、驚嘆號會自動略過，不佔用音符。
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
