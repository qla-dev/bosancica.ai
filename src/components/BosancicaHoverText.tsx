import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles } from 'lucide-react';
import { toBosancicaFontInput } from '../bosancica';
import Button from './ui/Button';

interface BosancicaHoverTextProps {
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

const tokenize = (value: string) => {
  const tokens: Array<{ text: string; start: number; end: number }> = [];
  const matcher = /dž|lj|nj|./giu;
  for (const match of value.matchAll(matcher)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0], start, end: start + match[0].length });
  }
  return tokens;
};

export default function BosancicaHoverText({ value, onChange }: BosancicaHoverTextProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<SuggestionMenu | null>(null);
  const tokens = useMemo(() => tokenize(value), [value]);
  const suggestions = useMemo(() => menu ? getSuggestions(menu.selection) : [], [menu]);

  useEffect(() => {
    if (!menu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && (menuRef.current?.contains(target) || target.closest('.has-similar-letters'))) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [menu]);

  const openSuggestions = (element: HTMLElement, token: { text: string; start: number; end: number }) => {
    if (!getSuggestions(token.text).length) return;
    const rect = element.getBoundingClientRect();
    setMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      start: token.start,
      end: token.end,
      selection: token.text,
    });
  };

  const applySuggestion = (replacement: string) => {
    if (!menu) return;
    onChange(`${value.slice(0, menu.start)}${replacement}${value.slice(menu.end)}`);
    setMenu(null);
  };

  const position = menu ? {
    left: Math.max(8, Math.min(menu.x - 112, window.innerWidth - 232)),
    top: Math.min(menu.y, window.innerHeight - 150),
  } : undefined;

  return (
    <>
      <p className="bosancica-hover-text font-bosanko" aria-label="Digitalna Bosančica; kliknite slovo za slične oblike">
        {tokens.map((token) => (
          <span
            key={`${token.start}-${token.text}`}
            className={getSuggestions(token.text).length ? 'has-similar-letters' : undefined}
            role={getSuggestions(token.text).length ? 'button' : undefined}
            tabIndex={getSuggestions(token.text).length ? 0 : undefined}
            onClick={(event) => openSuggestions(event.currentTarget, token)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              openSuggestions(event.currentTarget, token);
            }}
          >
            {toBosancicaFontInput(token.text)}
          </span>
        ))}
      </p>

      {menu && createPortal(
          <div ref={menuRef} className="character-menu" style={position}>
            <div className="character-menu__header">
              <span><Sparkles size={13} /> Slična slova za</span>
              <strong className="font-bosanko">{toBosancicaFontInput(menu.selection)}</strong>
            </div>
            <div className="character-menu__options">
              {suggestions.map((suggestion) => (
                <Button key={suggestion} onClick={() => applySuggestion(suggestion)}>
                  <span className="font-bosanko">{toBosancicaFontInput(suggestion)}</span><Check size={12} />
                </Button>
              ))}
            </div>
          </div>,
        document.body,
      )}
    </>
  );
}
