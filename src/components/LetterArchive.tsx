import React, { useState, useRef, useEffect } from 'react';
import { BOSANCICA_LETTERS } from '../data';
import { BosancicaLetter, ValidationSample } from '../types';
import { Award, Check, PenTool, CheckCircle, Link2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { toBosancicaFontInput } from '../bosancica';
import Button from './ui/Button';
import PrimaryButton from './ui/PrimaryButton';

interface LetterArchiveProps {
  onAddTrainingSample: (sample: ValidationSample) => void;
}

const getLetterGlyph = (letter: BosancicaLetter) =>
  letter.fontInput ?? toBosancicaFontInput(letter.latinChar.split(/[ /]/)[0]);

interface LetterTileProps {
  key?: React.Key;
  letter: BosancicaLetter;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  status?: 'linked' | 'pending';
}

function LetterTile({ letter, isSelected, onClick, disabled = false, status }: LetterTileProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isSelected}
      className={`flex min-w-0 flex-col items-center justify-between p-3.5 rounded-xl border transition-all duration-300 relative group overflow-hidden disabled:cursor-not-allowed ${
        isSelected
          ? 'bg-[#1A1A1A] border-[#C5A059] shadow-[inset_0_0_12px_rgba(197,160,89,0.15)] font-bold'
          : 'bg-[#0A0A0A] border-[#2A2A2A] hover:bg-[#111111] hover:border-[#C5A059]/40'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {isSelected && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C5A059]" />}
      {status && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#C5A059]/50 bg-[#17140E] text-[#C5A059]">
          {status === 'pending' ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
        </span>
      )}

      <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-black border border-[#2A2A2A] group-hover:border-[#C5A059]/35 transition-colors overflow-hidden">
        <span className={`font-bosanko text-[48px] leading-none transition-colors duration-300 ${
          isSelected ? 'text-[#C5A059]' : 'text-stone-500 group-hover:text-stone-300'
        }`}>
          <span className="bosanko-glyph">{getLetterGlyph(letter)}</span>
        </span>
      </div>

      <div className="text-center mt-3 min-w-0">
        <span className="block text-xs font-serif font-bold text-stone-100 truncate">
          {letter.charName}
        </span>
        <span className="block text-[10px] text-stone-500 font-mono truncate">
          Lat: {letter.latinChar}
        </span>
        <span className="mt-1 block text-[8px] text-[#8F7545] font-mono">
          {status === 'linked' ? 'Već povezano' : `${letter.examplesCount} primjeraka`}
        </span>
      </div>
    </Button>
  );
}

const SIMILAR_LETTER_GROUPS = [
  ['C', 'Č', 'Ć'],
  ['D', 'Đ', 'DŽ'],
  ['E', 'I', 'JE'],
  ['U', 'JU'],
  ['L', 'LJ'],
  ['N', 'NJ'],
  ['O', 'OT'],
  ['S', 'Š', 'ŠT / ŠĆ / Ć'],
  ['Z', 'Ž'],
];

const createSimilarLetterMap = () => {
  const result: Record<string, string[]> = Object.fromEntries(BOSANCICA_LETTERS.map((letter) => [letter.id, []]));
  SIMILAR_LETTER_GROUPS.forEach((group) => {
    const letters = group
      .map((label) => BOSANCICA_LETTERS.find((letter) => letter.latinChar === label))
      .filter((letter): letter is BosancicaLetter => Boolean(letter));
    letters.forEach((letter) => {
      result[letter.id] = letters.filter((item) => item.id !== letter.id).map((item) => item.id);
    });
  });
  return result;
};

export default function LetterArchive({ onAddTrainingSample }: LetterArchiveProps) {
  const [selectedLetter, setSelectedLetter] = useState<BosancicaLetter>(BOSANCICA_LETTERS[0]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [similarLetters, setSimilarLetters] = useState<Record<string, string[]>>(createSimilarLetterMap);
  const [isAssociationModalOpen, setIsAssociationModalOpen] = useState(false);
  const [pendingAssociationIds, setPendingAssociationIds] = useState<string[]>([]);

  // Drawing Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnContent, setHasDrawnContent] = useState(false);

  // Set up canvas default settings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#C5A059'; // Artistic Flair Gold draw color
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Clear background with rich brand-dark
        ctx.fillStyle = '#0A0A0A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawnContent(false);
      }
    }
  }, [selectedLetter]);

  useEffect(() => {
    if (!isAssociationModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAssociationModalOpen(false);
        setPendingAssociationIds([]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAssociationModalOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support both mouse and touch
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawnContent(true);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0A0A0A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        setHasDrawnContent(false);
      }
    }
  };

  const submitTrainingSample = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnContent) return;

    const dataUrl = canvas.toDataURL();

    // Create training sample to bubble up to application state
    const newSample: ValidationSample = {
      id: `val-${Date.now()}`,
      letterId: selectedLetter.id,
      letterName: `${selectedLetter.charName} (${selectedLetter.latinChar})`,
      drawnPath: dataUrl,
      timestamp: 'upravo sada',
      status: 'pending'
    };

    onAddTrainingSample(newSample);
    clearCanvas();

    setSuccessMessage(`Hvala! Uzrok za slovo ${selectedLetter.charName} je uspješno poslan u AI red za recenziju kod AI Trenera.`);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  const openAssociationModal = () => {
    setPendingAssociationIds([]);
    setIsAssociationModalOpen(true);
  };

  const closeAssociationModal = () => {
    setPendingAssociationIds([]);
    setIsAssociationModalOpen(false);
  };

  const togglePendingAssociation = (letterId: string) => {
    setPendingAssociationIds((current) => (
      current.includes(letterId)
        ? current.filter((id) => id !== letterId)
        : [...current, letterId]
    ));
  };

  const addSimilarLetters = () => {
    if (pendingAssociationIds.length === 0) return;

    setSimilarLetters((current) => {
      const next: Record<string, string[]> = { ...current };

      pendingAssociationIds.forEach((letterId) => {
        next[selectedLetter.id] = Array.from(new Set([...(next[selectedLetter.id] ?? []), letterId]));
        next[letterId] = Array.from(new Set([...(next[letterId] ?? []), selectedLetter.id]));
      });

      return next;
    });
    closeAssociationModal();
  };

  const selectedSimilarLetters = (similarLetters[selectedLetter.id] ?? [])
    .map((id) => BOSANCICA_LETTERS.find((letter) => letter.id === id))
    .filter((letter): letter is BosancicaLetter => Boolean(letter));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-stone-200">
      {/* LEFT COLUMN: Alphabet grid of letters */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-md shadow-2xl">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {BOSANCICA_LETTERS.map((letter) => (
              <LetterTile
                key={letter.id}
                letter={letter}
                isSelected={selectedLetter.id === letter.id}
                onClick={() => setSelectedLetter(letter)}
              />
            ))}
          </div>

          {/* COMMUNITY CONTRIBUTIONS TIE-IN */}
          <div className="mt-6 p-4 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] hover:border-[#C5A059]/30 transition-colors flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/40 border border-emerald-900/40 flex items-center justify-center text-emerald-400">
              <Award className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-100">
                Pronađena i verifikovana 1,385 jedinstvena klesana uzorka u cijelom sistemu
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">
                Naša baza raste sakupljanjem i transliteracijom kamenih epigrafa sa stećaka i povelja
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Specific glyph editor, sketch canvas & training contributors */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* DETAILED GLYPH SPECIFICATIONS */}
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm shadow-2xl">
          <div className="mb-6 flex items-stretch justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="mb-1 block text-[10px] font-serif uppercase tracking-[0.15em] text-[#C5A059]">
                Karakteristike Slova
              </span>
                <h3 className="text-lg font-serif font-bold text-stone-100">
                  {selectedLetter.charName} (latinični znak "{selectedLetter.latinChar}")
                </h3>

              <div className="mt-3 flex">
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-[#C5A059]/25 bg-[#C5A059]/10 px-2.5 py-1 font-mono text-[10px] text-[#D4B069]">
                  <Award className="h-3 w-3" />
                  Trenirano na {selectedLetter.examplesCount} primjeraka
                </span>
              </div>
            </div>
            <div className="flex min-h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#2A2A2A] bg-black xl:w-20">
              <span className="font-bosanko text-[48px] leading-none text-[#C5A059] xl:text-[60px]">
                <span className="bosanko-glyph">{getLetterGlyph(selectedLetter)}</span>
              </span>
            </div>
          </div>

          <div className="mb-6 p-3.5 rounded-xl border border-[#2A2A2A] bg-black/35">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#C5A059]" />
                <div>
                  <strong className="block text-xs text-stone-200">Slična slova</strong>
                  <span className="block text-[9px] text-stone-500 mt-0.5">Povezani oblici za {selectedLetter.latinChar}</span>
                </div>
              </div>
              <span className="text-[9px] font-mono text-[#A88950]">{selectedSimilarLetters.length} veza</span>
            </div>

            {selectedSimilarLetters.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedSimilarLetters.map((letter) => (
                  <Button
                    key={letter.id}
                    type="button"
                    onClick={() => setSelectedLetter(letter)}
                    className="h-12 px-2.5 flex items-center gap-2 rounded-lg border border-[#39352E] bg-[#151513] hover:border-[#C5A059]/60 transition-colors"
                  >
                    <span className="font-bosanko text-3xl leading-none text-[#C5A059]">
                      <span className="bosanko-glyph">{getLetterGlyph(letter)}</span>
                    </span>
                    <span className="text-[10px] font-mono text-stone-400">{letter.latinChar}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-[10px] text-stone-600">Ovo slovo još nema pridružene slične oblike.</p>
            )}

            <PrimaryButton
              type="button"
              onClick={openAssociationModal}
              className="h-9 w-full px-3"
            >
              <Plus className="w-3.5 h-3.5" /> Pridruži slova
            </PrimaryButton>
          </div>

          {/* DYNAMIC DRAWING CANVAS */}
          <div className="border border-[#2A2A2A] rounded-xl overflow-hidden bg-[#0A0A0A] flex flex-col relative shadow-inner">
            <div className="p-3 bg-[#0F0F0F] border-b border-[#2A2A2A] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-[#C5A059]" />
                <span className="text-xs font-serif font-bold text-stone-100">
                  Crtanje slova: {selectedLetter.charName}
                </span>
              </div>
              <span className="text-[9px] text-[#FF5F1F] font-mono animate-pulse font-bold uppercase tracking-wider">
                Učitavanje za AI skup podataka
              </span>
            </div>

            {successMessage && (
              <div className="absolute inset-x-3 bottom-14 z-20 p-3 rounded-lg bg-emerald-950/90 border border-emerald-800 text-emerald-200 text-xs text-center flex items-center gap-1.5 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="p-4 flex flex-col items-center">
              <div className="relative max-w-full">
                <canvas
                  id="letter-sketch-pad"
                  ref={canvasRef}
                  width={300}
                  height={200}
                  onMouseDown={startDrawing}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onMouseMove={draw}
                  onTouchStart={startDrawing}
                  onTouchEnd={endDrawing}
                  onTouchMove={draw}
                  className="border border-[#2A2A2A] rounded cursor-crosshair bg-black max-w-full touch-none"
                />
                {!hasDrawnContent && (
                  <span className="absolute inset-0 grid place-items-center pointer-events-none font-bosanko text-[158px] leading-none text-[#C5A059]/18 overflow-hidden">
                    <span className="bosanko-glyph">{getLetterGlyph(selectedLetter)}</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-stone-500 mt-2 font-sans italic text-center">
                Pomoću miša ili prsta nacrtajte stilizovanu varijantu slova iznad
              </p>
            </div>

            <div className="p-3 bg-[#0F0F0F]/60 border-t border-[#2A2A2A] flex gap-2">
              <Button
                onClick={clearCanvas}
                disabled={!hasDrawnContent}
                className="px-3 py-1.5 rounded-[11px] border border-[#2A2A2A] hover:border-[#C5A059] text-stone-400 hover:text-[#C5A059] flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Očisti
              </Button>
              <PrimaryButton
                onClick={submitTrainingSample}
                disabled={!hasDrawnContent}
                className="flex-1 px-4 py-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Pošalji AI Treneru
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>

      {isAssociationModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAssociationModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="association-modal-title"
            className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#37332C] bg-[#0F0F0F] shadow-2xl sm:max-h-[calc(100vh-3rem)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#2A2A2A] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <span className="block text-[9px] font-mono uppercase text-[#A88950]">Slična slova</span>
                <h3 id="association-modal-title" className="truncate text-sm font-bold text-stone-100 sm:text-base">
                  Pridruži slova znaku {selectedLetter.latinChar}
                </h3>
              </div>
              <Button
                type="button"
                onClick={closeAssociationModal}
                aria-label="Zatvori izbor slova"
                title="Zatvori"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#34312C] text-stone-400 hover:border-[#C5A059]/60 hover:text-stone-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {BOSANCICA_LETTERS.map((letter) => {
                  const isCurrentLetter = letter.id === selectedLetter.id;
                  const isLinked = selectedSimilarLetters.some((item) => item.id === letter.id);
                  const isPending = pendingAssociationIds.includes(letter.id);

                  return (
                    <LetterTile
                      key={letter.id}
                      letter={letter}
                      isSelected={isLinked || isPending || isCurrentLetter}
                      disabled={isLinked || isCurrentLetter}
                      status={isLinked ? 'linked' : isPending ? 'pending' : undefined}
                      onClick={() => togglePendingAssociation(letter.id)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#2A2A2A] bg-[#0B0B0B] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span className="text-[10px] font-mono text-stone-500">
                Označeno: <strong className="text-[#C5A059]">{pendingAssociationIds.length}</strong>
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={closeAssociationModal}
                  className="h-9 flex-1 rounded-lg border border-[#34312C] px-4 font-semibold text-stone-400 hover:text-stone-100 sm:flex-none"
                >
                  Odustani
                </Button>
                <PrimaryButton
                  type="button"
                  onClick={addSimilarLetters}
                  disabled={pendingAssociationIds.length === 0}
                  className="h-9 flex-1 px-4 sm:flex-none"
                >
                  Pridruži označena
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
