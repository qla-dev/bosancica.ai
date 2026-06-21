import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import Button from './ui/Button';

interface EditableLatinTextProps {
  value: string;
  onChange: (value: string) => void;
}

type SuggestionMenu = {
  x: number;
  y: number;
  start: number;
  end: number;
  selection: string;
};

const SIMILAR_CHARACTER_GROUPS = [
  ['c', 'č', 'ć'],
  ['s', 'š'],
  ['z', 'ž'],
  ['d', 'đ', 'dž'],
  ['l', 'lj'],
  ['n', 'nj'],
  ['e', 'je'],
  ['u', 'ju'],
  ['o', 'ot'],
  ['i', 'j'],
] as const;

const getSuggestions = (selection: string) => {
  const normalized = selection.toLocaleLowerCase('bs');
  const group = SIMILAR_CHARACTER_GROUPS.find((items) => items.includes(normalized as never));
  if (!group) return [];
  const uppercase = selection === selection.toLocaleUpperCase('bs');
  return group
    .filter((item) => item !== normalized)
    .map((item) => uppercase ? item.toLocaleUpperCase('bs') : item);
};

export default function EditableLatinText({ value, onChange }: EditableLatinTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<SuggestionMenu | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!menu) return;
    setLoading(true);
    setSuggestions([]);
    const timer = window.setTimeout(() => {
      setSuggestions(getSuggestions(menu.selection));
      setLoading(false);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [menu]);

  const position = useMemo(() => {
    if (!menu) return { left: 0, top: 0 };
    return {
      left: Math.min(menu.x, window.innerWidth - 240),
      top: Math.min(menu.y, window.innerHeight - 150),
    };
  }, [menu]);

  const openSuggestions = (event: MouseEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    let start = target.selectionStart;
    let end = target.selectionEnd;
    if (start === end) {
      start = Math.min(start, Math.max(value.length - 1, 0));
      end = Math.min(start + 1, value.length);
    }
    const selection = value.slice(start, end).trim();
    if (!selection) return;
    target.setSelectionRange(start, end);
    setMenu({ x: event.clientX + 4, y: event.clientY + 8, start, end, selection });
  };

  const applySuggestion = (replacement: string) => {
    if (!menu) return;
    const nextValue = `${value.slice(0, menu.start)}${replacement}${value.slice(menu.end)}`;
    onChange(nextValue);
    const caret = menu.start + replacement.length;
    setMenu(null);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onContextMenu={openSuggestions}
        rows={3}
        spellCheck
        className="latin-editor"
        aria-label="Uredi latiničnu transkripciju"
        title="Označite slovo i kliknite desnim klikom za slične znakove"
      />

      {menu && createPortal(
        <>
          <Button className="character-menu-scrim" aria-label="Zatvori prijedloge" onClick={() => setMenu(null)} />
          <div className="character-menu" style={position}>
            <div className="character-menu__header">
              <span><Sparkles size={13} /> Slična slova za</span>
              <strong>{menu.selection}</strong>
            </div>
            {loading ? (
              <div className="character-menu__loading"><LoaderCircle size={16} /> Tražim oblike…</div>
            ) : suggestions.length ? (
              <div className="character-menu__options">
                {suggestions.map((suggestion) => (
                  <Button key={suggestion} onClick={() => applySuggestion(suggestion)}>
                    <span>{suggestion}</span><Check size={12} />
                  </Button>
                ))}
              </div>
            ) : (
              <div className="character-menu__empty">Nema sličnih znakova za ovaj odabir.</div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
