import React, { useState } from 'react';
import { Sliders, Play, Terminal } from 'lucide-react';
import { toBosancicaFontInput } from '../bosancica';
import PrimaryButton from './ui/PrimaryButton';

export default function TrainerDashboard() {
  // Kraken parameters
  const [threshold, setThreshold] = useState<number>(128);
  const [minWordLength, setMinWordLength] = useState<number>(15);
  const [dilationCycles, setDilationCycles] = useState<number>(3);

  // Re-run mock training console logs state
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [trainingLogs, setTrainingLogs] = useState<string[]>([
    'Sistem spreman: model bosancica_neural_v1.4.bin učitan.',
    'Svi Kraken alati dostupni u sandbox okruženju.'
  ]);
  const startMockTraining = () => {
    if (isTraining) return;
    setIsTraining(true);
    setTrainingLogs([
      '[KRAKEN-ENGINE] Pokrećem analizu novih uzoraka...',
      'Inicijalizacija neuronske mreže: ResNet50 + Transformer-CTC...',
      'Učitavanje validiranih klesanih ligature...'
    ]);

    let step = 0;
    const logs = [
      '[DATA-PREP] Učitana 1,385 verifikovana uzorka.',
      '[EPOCH 1/5] Loss: 0.1245 | Tacnost: 94.2% | Vrijeme: 450ms',
      '[EPOCH 2/5] Loss: 0.0894 | Tacnost: 95.8% | Vrijeme: 421ms',
      '[EPOCH 3/5] Loss: 0.0612 | Tacnost: 96.5% | Vrijeme: 433ms',
      '[EPOCH 4/5] Loss: 0.0388 | Tacnost: 97.1% | Vrijeme: 460ms',
      '[EPOCH 5/5] Loss: 0.0195 | Tacnost: 98.2% | Vrijeme: 412ms',
      '[TRENING] Uspješno konvergirano! Novi model spremljen.',
      '[KRAKEN-ENG] bosancica_neural_v1.5.bin uspješno spremljen u oblak.'
    ];

    const timer = setInterval(() => {
      if (step < logs.length) {
        setTrainingLogs((prev) => [...prev, logs[step]]);
        step++;
      } else {
        clearInterval(timer);
        setIsTraining(false);
      }
    }, 600);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-stone-200">
      <>
        {/* KRAKEN ALATI CARD */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#2A2A2A]">
            <Sliders className="w-5 h-5 text-[#C5A059]" id="kraken-icon" />
            <div>
              <h3 className="text-lg font-serif font-semibold text-stone-100">
                Kraken Binarizacija i Segmentacija
              </h3>
              <p className="text-xs text-stone-400">
                Podešavanje neuronskih filtera za stare dokumente i kamene površine
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-300 font-sans">Prag binarnosti (Threshold)</span>
                <span className="text-[#C5A059] font-mono font-bold">{threshold} / 255</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-[#C5A059] h-1 bg-black rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Korigovanje praga kontrasta. Pomaže kod uklanjanja tamnih mrlja sa starog pergamenta.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-300 font-sans">Min. širina riječi (px)</span>
                <span className="text-[#C5A059] font-mono font-bold">{minWordLength}px</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                value={minWordLength}
                onChange={(e) => setMinWordLength(Number(e.target.value))}
                className="w-full accent-[#C5A059] h-1 bg-black rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Ignorisanje sitnih kamenih pukotina koje Kraken greškom detektuje kao slova.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-300 font-sans">Ciklusi dilacije (Dilation)</span>
                <span className="text-[#C5A059] font-mono font-bold">{dilationCycles} ciklusa</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                value={dilationCycles}
                onChange={(e) => setDilationCycles(Number(e.target.value))}
                className="w-full accent-[#C5A059] h-1 bg-black rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Spajanje isprekidanih linija kista ili dlijeta na oštećenim površinama.
              </p>
            </div>
          </div>

          {/* VISUAL FEEDBACK PREVIEW */}
          <div className="mt-6 p-4 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] flex flex-col justify-center items-center">
            <span className="text-[9px] text-stone-500 font-mono mb-2 uppercase tracking-wider self-start">
              Kraken Segmentacija u realnom vremenu
            </span>
            <div className="w-full h-32 relative bg-black rounded-lg overflow-hidden border border-[#2A2A2A] flex items-center justify-center p-4">
              {/* Filter preview that shifts according to slider states */}
              <div className="text-center transition-all duration-150 relative">
                <p
                  style={{
                    filter: `contrast(${threshold / 100}) grayscale(1)`,
                    letterSpacing: `${dilationCycles * 1.5}px`
                  }}
                  className="font-bosanko text-4xl text-[#C5A059] tracking-widest transition-all select-none font-normal"
                >
                  {toBosancicaFontInput('U ime oca i sina')}
                </p>
                <div
                  style={{ opacity: minWordLength > 20 ? 0.3 : 1 }}
                  className="absolute -inset-2 border border-[#C5A059]/40 rounded pointer-events-none transition-opacity animate-pulse"
                >
                  <span className="absolute top-0 left-1 text-[8px] bg-black border border-[#2A2A2A] px-1.5 py-0.5 text-[#C5A059] font-bold tracking-widest uppercase">
                    KRAKEN-BOX
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI TRAINING CLI CARD */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-md flex flex-col shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-4.5 h-4.5 text-[#C5A059]" />
              <h4 className="text-sm font-serif font-bold text-stone-100">
                Pogon za Treniranje Neuralnog Modela
              </h4>
            </div>
            <PrimaryButton
              onClick={startMockTraining}
              disabled={isTraining}
              className="px-4 py-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isTraining ? 'Fino učenje...' : 'Treniraj Model'}</span>
            </PrimaryButton>
          </div>

          <div
            id="retro-terminal"
            className="flex-1 bg-black p-4 rounded-xl border border-[#2A2A2A] font-mono text-xs text-stone-300 overflow-y-auto max-h-[220px] shadow-inner"
          >
            {trainingLogs.map((log, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  log.startsWith('[EPOCH')
                    ? 'text-[#C5A059]'
                    : log.startsWith('[TRENING') || log.startsWith('[KRAKEN-ENG')
                    ? 'text-emerald-400 font-bold'
                    : 'text-stone-400'
                }`}
              >
                {log}
              </div>
            ))}
            {isTraining && (
              <div className="text-[#C5A059] animate-pulse mt-1">
                ▋ Optimizacija matrica u toku...
              </div>
            )}
          </div>
        </div>
      </>
    </div>
  );
}
