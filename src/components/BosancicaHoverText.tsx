import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, Delete, Space, X } from 'lucide-react';
import { motion } from 'motion/react';
import { translateUiText, type AppLanguage } from '../i18n';

interface BosancicaHoverTextProps {
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
}

type KeyboardKey = {
  codes?: Record<AppLanguage, string>;
  keycaps: Record<AppLanguage, string>;
  letter: string;
  shortcut?: string;
};

// The normal Latin letters stay under their physical counterparts. Less common
// Bosančica/Cyrillic letters occupy otherwise vacant Q, W, X and punctuation
// keys, so typing remains easy to learn on a QWERTZ/QWERTY keyboard.
const key = (letter: string, bs: string, en: string, bsCode?: string, enCode?: string): KeyboardKey => ({
  letter,
  keycaps: { bs, en },
  codes: { bs: bsCode ?? `Key${bs}`, en: enCode ?? `Key${en}` },
});

// Keycap labels follow the selected keyboard layout. Bosnian is QWERTZ and
// shows its native diacritics; English is QWERTY and shows the US key labels.
const KEYBOARD_ROWS: KeyboardKey[][] = [
  [
    key('љ', 'Q', 'Q'), key('њ', 'W', 'W'), key('е', 'E', 'E'), key('р', 'R', 'R'),
    key('т', 'T', 'T'), key('з', 'Z', 'Y', 'KeyY', 'KeyY'), key('ꙋ', 'U', 'U'),
    key('и', 'I', 'I'), key('о', 'O', 'O'), key('п', 'P', 'P'),
    key('ш', 'Š', '[', 'BracketLeft', 'BracketLeft'), key('ђ', 'Đ', ']', 'BracketRight', 'BracketRight'),
  ],
  [
    key('а', 'A', 'A'), key('с', 'S', 'S'), key('д', 'D', 'D'), key('ф', 'F', 'F'),
    key('г', 'G', 'G'), key('х', 'H', 'H'), key('ѣ', 'J', 'J'), key('к', 'K', 'K'),
    key('л', 'L', 'L'), key('ч', 'Č', ';', 'Semicolon', 'Semicolon'),
    key('ћ', 'Ć', "'", 'Quote', 'Quote'), key('ж', 'Ž', '\\', 'Backslash', 'Backslash'),
  ],
  [
    key('џ', 'DŽ', 'X', 'KeyX', 'KeyX'), key('ц', 'C', 'C'), key('в', 'V', 'V'),
    key('б', 'B', 'B'), key('н', 'N', 'N'), key('м', 'M', 'M'),
  ],
];

export default function BosancicaHoverText({ value, onChange, language }: BosancicaHoverTextProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const keyboardPositionerRef = useRef<HTMLDivElement>(null);
  const keyboardDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardPosition, setKeyboardPosition] = useState<{ x: number; y: number } | null>(null);
  const t = (value: string) => translateUiText(value, language);

  useEffect(() => {
    if (!keyboardOpen) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (editorRef.current?.contains(target) || keyboardRef.current?.contains(target)) return;
      setKeyboardOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKeyboardOpen(false);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [keyboardOpen]);

  const replaceSelection = (replacement: string, removeBefore = 0) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const start = Math.max(0, selectionStart - removeBefore);
    onChange(`${value.slice(0, start)}${replacement}${value.slice(selectionEnd)}`);

    const cursor = start + replacement.length;
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const handleBackspace = () => {
    const editor = editorRef.current;
    if (!editor) return;
    replaceSelection('', editor.selectionStart === editor.selectionEnd ? 1 : 0);
  };

  const insertLetter = (letter: string) => replaceSelection(letter);

  const handlePhysicalKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.isComposing || event.metaKey) return;

    const shortcutLetter = event.ctrlKey && event.altKey
      ? KEYBOARD_ROWS.flat().find((key) => key.shortcut === event.code)?.letter
      : undefined;
    if (shortcutLetter) {
      event.preventDefault();
      replaceSelection(event.shiftKey ? shortcutLetter.toLocaleUpperCase('bs') : shortcutLetter);
      return;
    }

    if (event.ctrlKey || event.altKey) return;

    const letter = KEYBOARD_ROWS.flat().find((key) => key.codes?.[language] === event.code)?.letter;
    if (!letter) return;

    event.preventDefault();
    replaceSelection(letter);
  };

  const startKeyboardDrag = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = keyboardPositionerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    keyboardDragRef.current = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    setKeyboardPosition({ x: bounds.left, y: bounds.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveKeyboard = (event: PointerEvent<HTMLDivElement>) => {
    const drag = keyboardDragRef.current;
    const bounds = keyboardRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    setKeyboardPosition({
      x: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, event.clientX - drag.offsetX)),
      y: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, event.clientY - drag.offsetY)),
    });
  };

  const endKeyboardDrag = () => {
    keyboardDragRef.current = null;
  };

  return (
    <>
      <textarea
        ref={editorRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handlePhysicalKeyDown}
        onFocus={() => {
          setKeyboardOpen(true);
          window.setTimeout(() => editorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
        }}
        rows={3}
        spellCheck={false}
        className="bosancica-editor font-bosanko"
        aria-label="Uredi digitalnu Bosančicu"
        aria-expanded={keyboardOpen}
      />

      {keyboardOpen && createPortal(
        <div
          ref={keyboardPositionerRef}
          className="bosancica-keyboard__positioner"
          style={keyboardPosition
            ? { left: keyboardPosition.x, top: keyboardPosition.y }
            : { left: '50%', bottom: 12, transform: 'translateX(-50%)' }}
        >
          <motion.div
            ref={keyboardRef}
            className="bosancica-keyboard"
            role="group"
            aria-label="Digitalna tastatura za Bosančicu"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          >
          <div className="bosancica-keyboard__header">
            <div className="bosancica-keyboard__drag-handle" onPointerDown={startKeyboardDrag} onPointerMove={moveKeyboard} onPointerUp={endKeyboardDrag} onPointerCancel={endKeyboardDrag}>
              <strong>{t('Digitalna Bosančica')}</strong>
            </div>
            <button type="button" onClick={() => setKeyboardOpen(false)} aria-label={t('Zatvori tastaturu')}>
              <X size={17} />
            </button>
          </div>

          <div className="bosancica-keyboard__rows">
            {KEYBOARD_ROWS.map((row, rowIndex) => (
              <div key={rowIndex} className="bosancica-keyboard__row">
                {row.map((key) => (
                  <button
                    key={key.letter}
                    type="button"
                    className="font-bosanko"
                    onClick={() => insertLetter(key.letter)}
                    aria-label={`${t('Unesi')} ${key.letter} ${t('pomoću tipke')} ${key.keycaps[language]}`}
                  >
                    {key.letter}
                    <kbd>{key.keycaps[language]}</kbd>
                  </button>
                ))}
              </div>
            ))}
            <div className="bosancica-keyboard__row bosancica-keyboard__actions">
              <button type="button" className="is-space" onClick={() => replaceSelection(' ')}>
                <Space size={18} /> {t('Razmak')}
              </button>
              <button type="button" onClick={() => replaceSelection('\n')}>
                <ArrowDownToLine size={18} /> {t('Novi red')}
              </button>
              <button type="button" onClick={handleBackspace}>
                <Delete size={18} /> {t('Izbriši')}
              </button>
            </div>
          </div>
          </motion.div>
        </div>,
        document.body,
      )}
    </>
  );
}
