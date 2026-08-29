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
        className="relative w-full max-w-xl max-h-[90vh] bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl shadow-black/90 flex flex-col overflow-hidden ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Card Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-850 border-b border-slate-750 shrink-0">
          <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-slate-100">
            {type === 'melody' ? (
              <>
                <span className="text-amber-400">🎵</span>
                <span>旋律輸入語法說明</span>
              </>
            ) : (
              <>
                <span className="text-sky-400">📝</span>
                <span>歌詞輸入語法說明</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition text-xs flex items-center gap-1"
            title="關閉說明 (Esc 或點擊背景)"
          >
            <span>✕</span>
            <span>關閉</span>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-200">
          {type === 'melody' ? (
            <>
              {/* Section 1: 音高與八度 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                  <span>🎵</span>
                  <span>音高與八度記號</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">基本音符 (Do~Si)</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">1 ~ 7</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">休止符</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">0</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">高音點（單引號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">' (如 1')</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">低音點（逗號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">, (如 5,)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">升音記號（井字號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700"># (如 #4)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">降音記號（錢字符號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">$ (如 $7)</kbd>
                  </div>
                </div>
              </div>

              {/* Section 2: 時值與節奏 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                  <span>⏱️</span>
                  <span>時值與節奏記號</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">增時線 / 延音（減號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">- (如 1 - - -)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">附點（句號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">. (如 3.)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">八分減時線（底線）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">_ (如 5_)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">十六分減時線（等號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">= (如 5=)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">連音群組（中括號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">[5 5 5]_</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">圓滑線（波浪號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">~ (如 3~ 3)</kbd>
                  </div>
                </div>
              </div>

              {/* Section 3: 小節與調號 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-1.5">
                  <span>📐</span>
                  <span>小節、調號與拍號</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">小節線（直線符號）</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-purple-300 font-mono font-bold rounded border border-slate-700">| (如 | 1 2 3 4 |)</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">調號與拍號宣告</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-purple-300 font-mono font-bold rounded border border-slate-700">&lt;key&gt; C, &lt;time&gt; 4/4</kbd>
                  </div>
                </div>
              </div>

              {/* Section 4: 實用輸入範例 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>旋律範例</span>
                </h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-0.5">
                    <div className="text-slate-400 font-sans font-medium text-[11px]">4/4 拍常見旋律：</div>
                    <div className="text-amber-300">| 1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-0.5">
                    <div className="text-slate-400 font-sans font-medium text-[11px]">附點、減時線與高低音：</div>
                    <div className="text-amber-300">[5, 5, 5,]_ | 3. 5_ [1' 7]_ 6 | 5 - 3</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Section 1: 段落與投影片分頁 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                  <span>🏷️</span>
                  <span>段落標籤與自動分頁</span>
                </h3>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-slate-200 font-medium">段落標籤 &lt;tag&gt;</div>
                      <div className="text-slate-500 text-[11px]">投影片以標籤自動分段換頁，顯示於每頁卡片標頭</div>
                    </div>
                    <kbd className="px-2 py-0.5 bg-slate-800 text-sky-300 font-mono font-bold rounded border border-slate-700">
                      &lt;tag&gt; 主歌 1
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 text-[11px] leading-relaxed">
                    在段落前加入如 <code className="text-sky-300">&lt;tag&gt; 主歌</code> 或 <code className="text-sky-300">&lt;tag&gt; 副歌</code>，系統會自動將不同段落切換至下一張投影片。
                  </div>
                </div>
              </div>

              {/* Section 2: 字音對齊與連音延展 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                  <span>🔤</span>
                  <span>字音對齊與一字多音</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-medium">單字對齊音符</span>
                      <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">一字一音</kbd>
                    </div>
                    <p className="text-slate-500 text-[11px]">每個漢字或英文字母依序自動對齊旋律中的一個音符。</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-medium">一字多音（圓滑線）</span>
                      <kbd className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono font-bold rounded border border-slate-700">字~~</kbd>
                    </div>
                    <p className="text-slate-500 text-[11px]">使用波浪號 <code className="text-amber-300">~</code> 延伸發音。例如 <code className="text-amber-300">神~~</code> 代表該字跨唱 3 個音符。</p>
                  </div>
                </div>
              </div>

              {/* Section 3: 標點符號與排版規則 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-1.5">
                  <span>✍️</span>
                  <span>標點符號與分行排版</span>
                </h3>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-slate-300 font-medium">標點符號自動忽略</div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      空白鍵、逗號（<code className="text-purple-300">，</code> 或 <code className="text-purple-300">,</code>）、句號（<code className="text-purple-300">。</code> 或 <code className="text-purple-300">.</code>）、驚嘆號（<code className="text-purple-300">！</code>）在對齊音符時會自動略過，不佔用音符名額，您可以放心自由加入標點增加可讀性。
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-slate-300 font-medium">歌詞分行</div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      歌詞每換一行，即代表投影片簡譜的一行（需確保該行字數與對應旋律的小節音符數相符）。
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 4: 實用對照範例 */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>歌詞對照範例</span>
                </h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-sky-300">&lt;tag&gt; 主歌 1</div>
                    <div className="text-slate-200">主啊我神！我每當希奇默想，</div>
                    <div className="text-slate-200">你看見救恩~~~~，成就在我身。</div>
                    <div className="text-slate-500 font-sans text-[11px] mt-1">（「救恩~~~~」搭配 4 個波浪號，代表「恩」字在簡譜上會連唱 5 個音符）</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
