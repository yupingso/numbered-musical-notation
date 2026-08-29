import React from 'react';
import { StackedDualEditor } from './StackedDualEditor';
import { HelpType } from './SyntaxHelpOverlay';

interface InputContainerProps {
  melodyText: string;
  setMelodyText: (val: string) => void;
  lyricsText: string;
  setLyricsText: (val: string) => void;
  activeHelp: HelpType | null;
  onToggleHelp: (type: HelpType) => void;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  melodyText,
  setMelodyText,
  lyricsText,
  setLyricsText,
  activeHelp,
  onToggleHelp,
}) => {
  return (
    <div className="flex flex-col h-full bg-[#0b0f19]">
      {/* Editors Area (Maximized full height) */}
      <div className="flex flex-col flex-1 p-3 min-h-0">
        <StackedDualEditor
          melodyText={melodyText}
          setMelodyText={setMelodyText}
          lyricsText={lyricsText}
          setLyricsText={setLyricsText}
          activeHelp={activeHelp}
          onToggleHelp={onToggleHelp}
        />
      </div>
    </div>
  );
};
