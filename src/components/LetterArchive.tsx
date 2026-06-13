import React, { useState, useRef, useEffect } from 'react';
import { BOSANCICA_LETTERS } from '../data';
import { BosancicaLetter, ValidationSample } from '../types';
import { Award, PenTool, CheckCircle, Info, RefreshCw, Star, Trash2 } from 'lucide-react';

interface LetterArchiveProps {
  onAddTrainingSample: (sample: ValidationSample) => void;
}

export default function LetterArchive({ onAddTrainingSample }: LetterArchiveProps) {
  const [selectedLetter, setSelectedLetter] = useState<BosancicaLetter>(BOSANCICA_LETTERS[0]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      }
    }
  }, [selectedLetter]);

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
    const x = clientX - rect.left;
    const y = clientY - rect.top;

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-stone-200">
      {/* LEFT COLUMN: Alphabet grid of letters */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-md shadow-2xl">
          <div className="mb-4">
            <h3 className="text-lg font-serif font-semibold text-stone-100">
              Arhiv i Abecednik Bosančice
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Odaberite slovo za prikaz klesanih karakteristika i predaju unosa
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {BOSANCICA_LETTERS.map((letter) => (
              <button
                key={letter.id}
                onClick={() => setSelectedLetter(letter)}
                className={`flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all duration-300 relative group overflow-hidden ${
                  selectedLetter.id === letter.id
                    ? 'bg-[#1A1A1A] border-[#C5A059] shadow-[inset_0_0_12px_rgba(197,160,89,0.15)] font-bold'
                    : 'bg-[#0A0A0A] border-[#2A2A2A] hover:bg-[#111111] hover:border-[#C5A059]/40'
                }`}
              >
                {/* Visual Accent for selections */}
                {selectedLetter.id === letter.id && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C5A059]"></div>
                )}

                {/* Simulated old paper background subtle texture for icon box */}
                <div className="w-12 h-12 flex items-center justify-center rounded bg-black border border-[#2A2A2A] group-hover:border-[#C5A059]/35 transition-colors">
                  <svg
                    viewBox="0 0 100 100"
                    className={`w-8 h-8 stroke-2 fill-none transition-colors duration-300 ${
                      selectedLetter.id === letter.id ? 'stroke-[#C5A059]' : 'stroke-stone-500 group-hover:stroke-stone-300'
                    }`}
                  >
                    <path d={letter.svgPath} />
                  </svg>
                </div>

                <div className="text-center mt-3">
                  <span className="block text-xs font-serif font-bold text-stone-100">
                    {letter.charName}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    Lat: {letter.latinChar}
                  </span>
                </div>
              </button>
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
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-[0.15em] text-[#C5A059] block mb-1">
                Karakteristike Slova
              </span>
              <h3 className="text-lg font-serif font-bold text-stone-100">
                {selectedLetter.charName} (latinični znak "{selectedLetter.latinChar}")
              </h3>
            </div>
            <div className="w-14 h-14 bg-black rounded border border-[#2A2A2A] flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-9 h-9 stroke-[#C5A059] stroke-2 fill-none">
                <path d={selectedLetter.svgPath} />
              </svg>
            </div>
          </div>

          <p className="text-xs text-stone-300 leading-relaxed font-sans mb-4">
            {selectedLetter.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {selectedLetter.variants.map((v, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded bg-[#0A0A0A] border border-[#2A2A2A] text-[10px] text-stone-400 flex items-center gap-1 font-sans"
              >
                <Star className="w-3 h-3 text-[#C5A059]" />
                {v}
              </span>
            ))}
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
              <p className="text-[10px] text-stone-500 mt-2 font-sans italic text-center">
                Pomoću miša ili prsta nacrtajte stilizovanu varijantu slova iznad
              </p>
            </div>

            <div className="p-3 bg-[#0F0F0F]/60 border-t border-[#2A2A2A] flex gap-2">
              <button
                onClick={clearCanvas}
                disabled={!hasDrawnContent}
                className="px-3 py-1.5 rounded-lg border border-[#2A2A2A] hover:border-[#C5A059] text-stone-400 hover:text-[#C5A059] text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Očisti
              </button>
              <button
                onClick={submitTrainingSample}
                disabled={!hasDrawnContent}
                className="flex-1 px-4 py-2 bg-[#C5A059] hover:bg-[#D4B069] disabled:bg-stone-850 disabled:text-stone-500 text-black text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-black" />
                Pošalji AI Treneru
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
