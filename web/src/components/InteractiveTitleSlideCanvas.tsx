import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { SongMetadata } from '../core/types';
import {
  SvgRenderer,
  calculateTitleLayout,
  calculateSubtitleLayout,
} from '../core/svgRenderer';

export interface InteractiveTitleSlideCanvasProps {
  metadata?: SongMetadata;
  onUpdateMetadata?: (newMetadata: Partial<SongMetadata>) => void;
}

type EditableField = 'title' | 'subtitle' | 'album' | 'credits' | null;

export const InteractiveTitleSlideCanvas: React.FC<InteractiveTitleSlideCanvasProps> = ({
  metadata,
  onUpdateMetadata,
}) => {
  const W = SvgRenderer.SLIDE_WIDTH;
  const H = SvgRenderer.SLIDE_HEIGHT;

  const [activeField, setActiveField] = useState<EditableField>(null);
  const [editText, setEditText] = useState('');
  const [optimisticOverrides, setOptimisticOverrides] = useState<Partial<SongMetadata>>({});
  const isCommittingRef = useRef(false);

  // Clear optimistic overrides once parent metadata catches up
  useEffect(() => {
    setOptimisticOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next) as (keyof SongMetadata)[]) {
        if (metadata?.[k] === next[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [metadata]);

  const rawTitle =
    optimisticOverrides.title !== undefined
      ? optimisticOverrides.title
      : (metadata?.title ?? '');
  const rawSubtitle =
    optimisticOverrides.subtitle !== undefined
      ? optimisticOverrides.subtitle
      : (metadata?.subtitle ?? '');
  const rawAlbum =
    optimisticOverrides.album !== undefined
      ? optimisticOverrides.album
      : (metadata?.album ?? '');
  const rawCredits =
    optimisticOverrides.credits !== undefined
      ? optimisticOverrides.credits
      : (metadata?.credits ?? '');

  const displayAlbum = rawAlbum || '專輯';
  const displayCredits = rawCredits || '詞： / 曲：';

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subtitleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute base layouts matching SvgRenderer
  const titleLayout = calculateTitleLayout(rawTitle || '標題');
  const isTitleMultiLine = titleLayout.lines.length > 1;
  const subtitleLayout = calculateSubtitleLayout(rawSubtitle || 'Title', isTitleMultiLine);

  // Start editing a specific field: populate with display/placeholder so select() highlights it
  const startEditing = (field: EditableField) => {
    setActiveField(field);
    if (field === 'title') {
      setEditText(rawTitle ? rawTitle.replace(/\\n/g, '\n') : '標題');
    } else if (field === 'subtitle') {
      setEditText(rawSubtitle ? rawSubtitle.replace(/\\n/g, '\n') : 'Title');
    } else if (field === 'album') {
      setEditText(rawAlbum || '專輯');
    } else if (field === 'credits') {
      setEditText(rawCredits || '詞： / 曲：');
    }
  };

  // Commit current edit; if user kept placeholder or emptied it, don't store placeholder string
  const commitEdit = () => {
    if (!activeField || isCommittingRef.current) return;
    isCommittingRef.current = true;
    const field = activeField;

    if (field === 'title') {
      const val = editText.trim();
      const finalVal = val === '標題' && !rawTitle ? '' : val;
      setOptimisticOverrides((prev) => ({ ...prev, title: finalVal }));
      onUpdateMetadata?.({ title: finalVal });
    } else if (field === 'subtitle') {
      const val = editText.trim();
      const finalVal = val === 'Title' && !rawSubtitle ? '' : val;
      setOptimisticOverrides((prev) => ({ ...prev, subtitle: finalVal }));
      onUpdateMetadata?.({ subtitle: finalVal });
    } else if (field === 'album') {
      const val = editText.trim();
      const finalVal = val === '專輯' && !rawAlbum ? '' : val;
      setOptimisticOverrides((prev) => ({ ...prev, album: finalVal }));
      onUpdateMetadata?.({ album: finalVal });
    } else if (field === 'credits') {
      const val = editText.trim();
      const finalVal = val === '詞： / 曲：' && !rawCredits ? '' : val;
      setOptimisticOverrides((prev) => ({ ...prev, credits: finalVal }));
      onUpdateMetadata?.({ credits: finalVal });
    }

    setActiveField(null);
    setTimeout(() => {
      isCommittingRef.current = false;
    }, 100);
  };

  // Cancel current edit
  const cancelEdit = () => {
    isCommittingRef.current = true;
    setActiveField(null);
    setEditText('');
    setTimeout(() => {
      isCommittingRef.current = false;
    }, 100);
  };

  // Auto-focus and highlight entire text on click
  useEffect(() => {
    if (!activeField) return;
    const timer = setTimeout(() => {
      if (activeField === 'title' && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      } else if (activeField === 'subtitle' && subtitleTextareaRef.current) {
        subtitleTextareaRef.current.focus();
        subtitleTextareaRef.current.select();
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 20);
    return () => clearTimeout(timer);
  }, [activeField]);

  // Prevent any vertical scroll inside the textarea so Line 1 is never scrolled off-screen
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
    if (subtitleTextareaRef.current) {
      subtitleTextareaRef.current.scrollTop = 0;
    }
  }, [editText, activeField]);

  // Exact 1:1 dynamic geometry calculations matching SVG text baselines:
  // 1. Dynamic Title geometry: reactive to editText during active typing so Shift+Enter instantly resizes
  const activeTitleLayout = calculateTitleLayout(
    activeField === 'title' ? editText : rawTitle || '標題',
    activeField === 'title'
  );
  const isEditingTitleMultiLine = activeTitleLayout.lines.length > 1;
  const titleBoxW = 880;
  const titleBoxX = (W - titleBoxW) / 2;
  const titleFontSize = activeTitleLayout.fontSize;
  const titleBoxY = isEditingTitleMultiLine
    ? 215
    : Math.round(390 - titleFontSize * 0.82 - (titleFontSize * 0.15) / 2);
  const titleLineHeight = isEditingTitleMultiLine
    ? '120px'
    : `${Math.round(titleFontSize * 1.15)}px`;
  const titleBoxH = isEditingTitleMultiLine ? 245 : Math.round(titleFontSize * 1.18);

  // 2. Dynamic Subtitle geometry: reactive to editText during active typing so Shift+Enter instantly resizes
  const currentTitleMultiLine =
    activeField === 'title' ? isEditingTitleMultiLine : isTitleMultiLine;
  const activeSubLayout = calculateSubtitleLayout(
    activeField === 'subtitle' ? editText : rawSubtitle || 'Title',
    currentTitleMultiLine,
    activeField === 'subtitle'
  );
  const isEditingSubMultiLine = activeSubLayout.lines.length > 1;
  const subBoxW = 880;
  const subBoxX = (W - subBoxW) / 2;
  const subFontSize = activeSubLayout.fontSize;
  const subBoxY = isEditingSubMultiLine
    ? (currentTitleMultiLine ? 485 : 470)
    : activeSubLayout.lineYCoords[0] - 53;
  const subLineHeight = isEditingSubMultiLine
    ? `${Math.round(subFontSize * 1.18)}px`
    : '68px';
  const subBoxH = isEditingSubMultiLine ? 125 : 74;

  // 3. Album geometry: baseline 178, font size 76px, x 137
  const albumBoxY = 114;
  const albumBoxH = 82;

  // 4. Credits geometry: baseline 682, font size 56px
  const creditsBoxY = 635;
  const creditsBoxH = 62;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block"
        xmlns="http://www.w3.org/2000/svg"
        onClick={(e) => {
          // If clicked on SVG background outside any field, commit active edit
          if (e.target === e.currentTarget) {
            commitEdit();
          }
        }}
      >
        {/* Background */}
        <rect width={W} height={H} fill="#000000" />

        {/* 1. Album Name (top left, exact font 76px bold) */}
        {activeField === 'album' ? (
          <foreignObject x="137" y={albumBoxY} width="700" height={albumBoxH}>
            <input
              ref={inputRef}
              type="text"
              value={editText}
              placeholder="專輯"
              onChange={(e) => setEditText(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              style={{
                fontFamily: SvgRenderer.LYRIC_FONT,
                fontSize: '76px',
                fontWeight: 'bold',
                color: '#ffff00',
                lineHeight: '76px',
                height: '76px',
                padding: '0',
                margin: '0',
                border: 'none',
                outline: '2px solid #f59e0b',
                outlineOffset: '4px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                display: 'block',
                width: 'auto',
                minWidth: '200px',
              }}
            />
          </foreignObject>
        ) : (
          <g
            className="cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              startEditing('album');
            }}
          >
            <rect
              x="127"
              y={albumBoxY - 4}
              width="450"
              height={albumBoxH}
              fill="transparent"
              stroke="#ffff00"
              strokeWidth="2"
              strokeDasharray="6 4"
              rx="6"
              className="opacity-0 group-hover:opacity-60 transition-opacity"
            />
            <text
              x="137"
              y="178"
              fill="#ffff00"
              fontFamily={SvgRenderer.LYRIC_FONT}
              fontSize="76"
              fontWeight="bold"
            >
              {displayAlbum}
            </text>
          </g>
        )}

        {/* 2. Main Title (centered, dynamic font layout.fontSize bold) */}
        {activeField === 'title' ? (
          <foreignObject
            x={titleBoxX}
            y={titleBoxY}
            width={titleBoxW}
            height={titleBoxH}
          >
            <textarea
              ref={textareaRef}
              value={editText}
              placeholder="中文歌名"
              onChange={(e) => {
                setEditText(e.target.value);
                e.currentTarget.scrollTop = 0;
              }}
              onFocus={(e) => {
                e.target.select();
                e.currentTarget.scrollTop = 0;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    const lines = editText.split(/\r?\n/);
                    if (lines.length >= 2) {
                      e.preventDefault();
                      return;
                    }
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        textareaRef.current.scrollTop = 0;
                      }
                    });
                  } else {
                    e.preventDefault();
                    commitEdit();
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              rows={Math.max(1, activeTitleLayout.lines.length)}
              style={{
                fontFamily: `${SvgRenderer.LYRIC_FONT}, KaiTi, DFKai-SB, serif, sans-serif`,
                fontSize: `${titleFontSize}px`,
                lineHeight: titleLineHeight,
                fontWeight: 'bold',
                color: '#ffcc00',
                textAlign: 'center',
                padding: '0',
                margin: '0',
                border: 'none',
                outline: '2px solid #f59e0b',
                outlineOffset: '4px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                resize: 'none',
                width: '100%',
                height: '100%',
                display: 'block',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            />
          </foreignObject>
        ) : (
          <g
            className="cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              startEditing('title');
            }}
          >
            {/* Hover Outline */}
            <rect
              x={titleBoxX}
              y={titleBoxY}
              width={titleBoxW}
              height={titleBoxH}
              fill="transparent"
              stroke="#ffcc00"
              strokeWidth="2"
              strokeDasharray="8 5"
              rx="8"
              className="opacity-0 group-hover:opacity-60 transition-opacity"
            />
            {/* Title Text Lines */}
            {titleLayout.lines.map((line, idx) => (
              <text
                key={`title-line-${idx}`}
                x="512"
                y={titleLayout.lineYCoords[idx]}
                fill="#ffcc00"
                fontFamily={SvgRenderer.LYRIC_FONT}
                fontSize={titleLayout.fontSize}
                fontWeight="bold"
                textAnchor="middle"
              >
                {line}
              </text>
            ))}
          </g>
        )}

        {/* 3. English/Secondary Subtitle (centered, supports 1 or 2 lines) */}
        {activeField === 'subtitle' ? (
          <foreignObject
            x={subBoxX}
            y={subBoxY}
            width={subBoxW}
            height={subBoxH}
          >
            <textarea
              ref={subtitleTextareaRef}
              value={editText}
              placeholder="英文歌名"
              onChange={(e) => {
                setEditText(e.target.value);
                e.currentTarget.scrollTop = 0;
              }}
              onFocus={(e) => {
                e.target.select();
                e.currentTarget.scrollTop = 0;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    const lines = editText.split(/\r?\n/);
                    if (lines.length >= 2) {
                      e.preventDefault();
                      return;
                    }
                    requestAnimationFrame(() => {
                      if (subtitleTextareaRef.current) {
                        subtitleTextareaRef.current.scrollTop = 0;
                      }
                    });
                  } else {
                    e.preventDefault();
                    commitEdit();
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              rows={Math.max(1, activeSubLayout.lines.length)}
              style={{
                fontFamily: SvgRenderer.MUSIC_FONT,
                fontSize: `${subFontSize}px`,
                fontWeight: 'bold',
                color: '#ffcc00',
                lineHeight: subLineHeight,
                textAlign: 'center',
                padding: '0',
                margin: '0',
                border: 'none',
                outline: '2px solid #f59e0b',
                outlineOffset: '4px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                resize: 'none',
                width: '100%',
                height: '100%',
                display: 'block',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            />
          </foreignObject>
        ) : (
          <g
            className="cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              startEditing('subtitle');
            }}
          >
            <rect
              x={subBoxX}
              y={subBoxY}
              width={subBoxW}
              height={subBoxH}
              fill="transparent"
              stroke="#ffcc00"
              strokeWidth="2"
              strokeDasharray="6 4"
              rx="6"
              className="opacity-0 group-hover:opacity-60 transition-opacity"
            />
            {subtitleLayout.lines.map((line, idx) => (
              <text
                key={`subtitle-line-${idx}`}
                x="512"
                y={subtitleLayout.lineYCoords[idx]}
                fill="#ffcc00"
                fontFamily={SvgRenderer.MUSIC_FONT}
                fontSize={subtitleLayout.fontSize}
                fontWeight="bold"
                textAnchor="middle"
              >
                {line}
              </text>
            ))}
          </g>
        )}

        {/* 4. Credits (bottom centered, exact font 56px regular) */}
        {activeField === 'credits' ? (
          <foreignObject x="112" y={creditsBoxY} width="800" height={creditsBoxH}>
            <input
              ref={inputRef}
              type="text"
              value={editText}
              placeholder="詞/曲"
              onChange={(e) => setEditText(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              style={{
                fontFamily: SvgRenderer.LYRIC_FONT,
                fontSize: '56px',
                fontWeight: 'normal',
                color: '#ffffff',
                lineHeight: '56px',
                height: '56px',
                textAlign: 'center',
                padding: '0',
                margin: '0',
                border: 'none',
                outline: '2px solid #f59e0b',
                outlineOffset: '4px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                width: '100%',
                display: 'block',
                boxSizing: 'border-box',
              }}
            />
          </foreignObject>
        ) : (
          <g
            className="cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              startEditing('credits');
            }}
          >
            <rect
              x="162"
              y={creditsBoxY}
              width="700"
              height={creditsBoxH}
              fill="transparent"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="6 4"
              rx="6"
              className="opacity-0 group-hover:opacity-60 transition-opacity"
            />
            <text
              x="512"
              y="682"
              fill="#ffffff"
              fontFamily={SvgRenderer.LYRIC_FONT}
              fontSize="56"
              fontWeight="normal"
              textAnchor="middle"
            >
              {displayCredits}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
