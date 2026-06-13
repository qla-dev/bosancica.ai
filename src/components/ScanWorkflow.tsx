import React, { useState, useRef } from 'react';
import { PRESET_DOCUMENTS, MOCK_HISTORY } from '../data';
import { PresetDocument, ScanItem } from '../types';
import { Upload, Cpu, FileText, CheckCircle2, History, RefreshCw, Layers, ArrowRight } from 'lucide-react';

interface ScanWorkflowProps {
  onScanCompleted: (newScan: ScanItem) => void;
  scansHistory: ScanItem[];
}

export default function ScanWorkflow({ onScanCompleted, scansHistory }: ScanWorkflowProps) {
  const [selectedDoc, setSelectedDoc] = useState<PresetDocument>(PRESET_DOCUMENTS[0]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showResult, setShowResult] = useState(true);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [customFile, setCustomFile] = useState<{ name: string; url: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectPreset = (doc: PresetDocument) => {
    if (isScanning) return;
    setCustomFile(null);
    setSelectedDoc(doc);
    setShowResult(true);
    setActiveLine(null);
  };

  const triggerCustomFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fakeUrl = URL.createObjectURL(file);
      setCustomFile({ name: file.name, url: fakeUrl });

      // Create a fake document based on the selection to model custom scanning
      const fakeDoc: PresetDocument = {
        id: `custom-${Date.now()}`,
        title: file.name.substring(0, 24) || 'Uvezeni dokument d.b',
        year: 'Nepoznat period',
        origin: 'Učitano sa lokalnog računara',
        imageUrl: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80',
        rawBosančicaText: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA Ⰹ ⰔⰂⰅⰕⰑⰃA ⰄⰖⰘA.',
        latinText: 'Automatski detektovan tekst u starom bosanskom pismu.',
        lines: [
          {
            textBosančica: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA',
            textLatinica: 'U ime oca i sina i svetoga duha.',
            top: 30,
            height: 20
          },
          {
            textBosančica: 'Ⱑ ⰁAⰐⰠ ⰁⰑⰔⰐⰠⰔⰍⰉ ⰍⰖ Jews',
            textLatinica: 'Ja, ban bosanski, svedočim narodu.',
            top: 60,
            height: 20
          }
        ]
      };
      setSelectedDoc(fakeDoc);
      setShowResult(false);
      setActiveLine(null);
    }
  };

  const handleStartScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress(0);
    setShowResult(false);

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsScanning(false);
            setShowResult(true);

            // Add to history
            const newHistoryItem: ScanItem = {
              id: `scan-${Date.now()}`,
              date: 'Danas, uzastopni test',
              fileName: customFile ? customFile.name : `${selectedDoc.title.toLowerCase().replace(/\s+/g, '_')}.jpg`,
              title: selectedDoc.title,
              rawBosančicaText: selectedDoc.rawBosančicaText,
              latinText: selectedDoc.latinText,
              accuracy: parseFloat((94 + Math.random() * 5).toFixed(1)),
              durationMs: Math.floor(600 + Math.random() * 800)
            };
            onScanCompleted(newHistoryItem);
          }, 400);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT COLUMN: Preset selector & upload & active file preview */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* PRESET PAPERS */}
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm">
          <legend className="text-xs font-serif font-bold text-[#C5A059] uppercase tracking-[0.2em] mb-4">
            Iskopine i Dokumenti
          </legend>
          <div className="flex flex-col gap-3">
            {PRESET_DOCUMENTS.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleSelectPreset(doc)}
                className={`w-full text-left p-3.5 rounded-xl transition-all duration-300 flex items-start gap-4 border ${
                  selectedDoc.id === doc.id
                    ? 'bg-[#1A1A1A] border-[#C5A059] shadow-inner'
                    : 'bg-[#0A0A0A] border-[#2A2A2A] hover:bg-[#111] hover:border-[#C5A059]/40'
                }`}
              >
                <div className="w-12 h-12 rounded overflow-hidden border border-[#2A2A2A] flex-shrink-0">
                  <img
                    src={doc.imageUrl}
                    alt={doc.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover grayscale brightness-92 hover:grayscale-0 transition-all duration-500"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-serif font-bold text-stone-100 text-sm truncate">
                      {doc.title}
                    </span>
                    <span className="text-[10px] text-[#C5A059] font-mono shrink-0 font-bold uppercase tracking-wider">
                      {doc.year}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 truncate">{doc.origin}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="relative my-5 flex items-center justify-center">
            <span className="absolute bg-[#0F0F0F] px-3 text-[9px] text-stone-500 font-serif uppercase tracking-widest">
              ili prenesite novi uzorak
            </span>
            <div className="w-full border-t border-[#2A2A2A]"></div>
          </div>

          {/* CUSTOM UPLOAD TARGET */}
          <div
            onClick={triggerCustomFile}
            className={`cursor-pointer group flex flex-col items-center justify-center border border-dashed rounded-xl p-4 transition-all duration-300 ${
              customFile
                ? 'bg-[#C5A059]/5 border-[#C5A059]/60'
                : 'bg-[#0D0D0D] border-[#2A2A2A] hover:border-[#C5A059]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <Upload className="w-6 h-6 text-stone-500 group-hover:text-[#C5A059] mb-2 transition-colors" />
            <span className="text-xs text-stone-200 font-medium">
              {customFile ? customFile.name : 'Izaberite sliku natpisa'}
            </span>
            <span className="text-[10px] text-stone-500 mt-1 uppercase font-mono">
              PNG, JPG do 10MB • Kraken OCR segmentator
            </span>
          </div>
        </div>

        {/* WORKSPACE PREVIEW FRAME */}
        <div className="relative flex flex-col p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm overflow-hidden flex-1 select-none">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <span className="px-2 py-0.5 rounded bg-[#0A0A0A] border border-[#2A2A2A] text-[9px] text-[#C5A059]/80 font-mono">
              Rezolucija: 4K UHD
            </span>
          </div>

          <p className="text-xs font-serif text-[#C5A059] uppercase tracking-[0.2em] mb-3">
            Vizuelni Segmenter (Kraken OCR)
          </p>

          <div className="relative flex-1 bg-[#0A0A0A] rounded-xl overflow-hidden border border-[#2A2A2A] min-h-[300px] flex items-center justify-center group">
            {/* The Old Document Image */}
            <div className="absolute inset-0 opacity-80 mix-blend-luminosity">
              <img
                src={selectedDoc.imageUrl}
                alt="Bosančica scan"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover brightness-75 contrast-125"
              />
            </div>

            {/* Vintage filter overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30"></div>

            {/* Simulated OCR segmentation line boundaries overlay */}
            {selectedDoc.lines.map((ln, idx) => (
              <div
                key={idx}
                onMouseEnter={() => !isScanning && setActiveLine(idx)}
                onMouseLeave={() => !isScanning && setActiveLine(null)}
                style={{
                  top: `${ln.top}%`,
                  height: `${ln.height}%`,
                }}
                className={`absolute left-4 right-4 border rounded cursor-pointer transition-all duration-300 ${
                  activeLine === idx
                    ? 'border-[#C5A059] bg-[#C5A059]/10 shadow-[0_0_15px_rgba(197,160,89,0.25)]'
                    : 'border-white/5 bg-black/10'
                }`}
              >
                <div className="absolute -top-3 left-2 bg-[#0F0F0F] text-[8px] text-[#C5A059] px-1.5 py-0.5 border border-[#2A2A2A] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  Red #{idx + 1}
                </div>
              </div>
            ))}

            {/* SCANNING LASER EFFECT */}
            {isScanning && (
              <>
                <div
                  style={{ top: `${scanProgress}%` }}
                  className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#C5A059] to-transparent shadow-[0_0_12px_#C5A059] z-20 transition-all duration-150 ease-linear"
                ></div>
                <div
                  style={{ top: `${scanProgress}%` }}
                  className="absolute left-0 right-0 h-10 bg-gradient-to-b from-[#C5A059]/10 to-transparent z-10 transition-all duration-150 ease-linear -translate-y-10"
                ></div>
              </>
            )}

            {/* NO ACTIVE SCAN WATERMARK */}
            {!isScanning && !showResult && (
              <div className="text-center p-6 z-10 max-w-xs">
                <Layers className="w-10 h-10 text-[#C5A059]/40 mx-auto mb-3" />
                <p className="text-xs text-stone-300 font-medium font-serif leading-relaxed">
                  Pritisnite dugme ispod za pokretanje laserske Kraken segmentacije i prevođenja.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              id="btn-scan-trigger"
              onClick={handleStartScan}
              disabled={isScanning}
              className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#C5A059] hover:bg-[#D4B069] disabled:bg-stone-850 disabled:text-stone-500 text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-[0.98] cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Skeniranje u toku ({scanProgress}%)</span>
                </>
              ) : (
                <>
                  <Cpu className="w-4.5 h-4.5 text-black" />
                  <span>Pokreni AI Transkripciju</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: OCR Outputs / Decoders side by side & Scans Counter */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* COUNTER & PERFORMANCE HUDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm">
            <span className="text-stone-500 text-[10px] uppercase font-serif tracking-[0.15em] block mb-1">
              Odrađeni skenovi
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-stone-100">
                {scansHistory.length}
              </span>
              <span className="text-emerald-500 text-xs font-semibold">Aktivan status</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm">
            <span className="text-stone-500 text-[10px] uppercase font-serif tracking-[0.15em] block mb-1">
              Prosjek Pouzdanosti
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#C5A059]">
                96.4%
              </span>
              <span className="text-stone-400 text-xs font-serif">AI model v1.4</span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm flex flex-col justify-center">
            <span className="text-stone-500 text-[10px] uppercase font-serif tracking-[0.15em] block mb-1">
              Jezik platforme
            </span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2.5 bg-stone-100 relative rounded-sm flex flex-col overflow-hidden">
                <div className="h-1/3 bg-[#002F6C]"></div>
                <div className="h-1/3 bg-[#F4C430]"></div>
                <div className="h-1/3 bg-[#002F6C]"></div>
              </div>
              <span className="text-xs text-stone-300 font-medium">BOS (Starobosanski)</span>
            </div>
          </div>
        </div>

        {/* OCR RESULTS BOX */}
        <div className="flex-1 p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm flex flex-col min-h-[450px]">
          <div className="flex items-center justify-between mb-6 border-b border-[#2A2A2A] pb-4">
            <div>
              <h3 className="text-lg font-serif font-semibold text-stone-100">
                AI Rezultat i Transkripcija
              </h3>
              <p className="text-xs text-stone-405 mt-0.5">
                Drevne ligature izvučene Kraken mrežom na bosančici
              </p>
            </div>
            {showResult && (
              <span className="px-3 py-1 text-xs rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Uspješno dešifrovano
              </span>
            )}
          </div>

          {isScanning && (
            <div className="flex-grow flex flex-col items-center justify-center p-10 text-center animate-pulse">
              <RefreshCw className="w-8 h-8 text-[#C5A059] animate-spin mb-4" />
              <p className="text-sm text-stone-300 font-serif">Dešifrujem ligaturna spajanja...</p>
              <p className="text-xs text-stone-500 mt-1">Učitavam neuronske parametre za bosansku ćirilicu</p>
            </div>
          )}

          {!isScanning && !showResult && (
            <div className="flex-grow flex flex-col items-center justify-center p-12 text-center text-stone-500">
              <FileText className="w-12 h-12 text-[#2A2A2A] mb-3" />
              <p className="text-sm font-serif">Čekam aktivaciju skenera...</p>
              <p className="text-xs text-stone-600 mt-0.5">Odaberite povelju s lijeve strane i pokrenite AI rekonstrukciju</p>
            </div>
          )}

          {showResult && !isScanning && (
            <div className="flex-grow flex flex-col gap-6">
              {/* LINE BY LINE BREAKDOWN */}
              <div className="flex flex-col gap-4">
                <legend className="text-xs font-serif uppercase tracking-[0.2em] text-[#C5A059]">
                  Transkripcija po segmentima reda
                </legend>

                <div className="flex flex-col gap-3">
                  {selectedDoc.lines.map((line, idx) => (
                    <div
                      key={idx}
                      onMouseEnter={() => setActiveLine(idx)}
                      onMouseLeave={() => setActiveLine(null)}
                      className={`p-3.5 rounded-xl transition-all duration-200 border ${
                        activeLine === idx
                          ? 'bg-[#1A1A1A] border-[#C5A059]/80 translate-x-1 shadow-md'
                          : 'bg-[#0A0A0A] border-[#2A2A2A]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono bg-[#1A1A1A] border border-[#2A2A2A] px-1.5 py-0.5 rounded text-[#C5A059] font-bold">
                          RED {idx + 1}
                        </span>
                        <div className="w-full border-t border-[#2A2A2A]/40"></div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* DIGITAL BOSANCICA GRAPHICS */}
                        <div className="flex flex-col gap-1.5 bg-black/40 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Digitalna Bosančica (Font)
                          </span>
                          <p className="text-xl font-serif text-[#C5A059] hover:text-[#D4B069] transition-colors tracking-widest break-all">
                            {line.textBosančica}
                          </p>
                        </div>

                        {/* TRANSLATION LATINICA */}
                        <div className="flex flex-col gap-1.5 bg-[#1A1A1A]/30 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Savremena Latinica
                          </span>
                          <p className="text-xs text-stone-300 leading-relaxed font-sans">
                            {line.textLatinica}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* INTEGRATED FULL TEXT EXPORT */}
              <div className="mt-4 p-4 rounded-xl bg-black/45 border border-[#2A2A2A]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-stone-400 font-serif">Kompletan Latinični Tekst</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedDoc.latinText);
                      alert('Tekst uspješno kopiran u međumemoriju!');
                    }}
                    className="text-[10px] text-[#C5A059] font-bold hover:text-[#D4B069] cursor-pointer"
                  >
                    Kopiraj Tekst
                  </button>
                </div>
                <p className="text-xs text-[#E0E0E0] leading-relaxed italic">
                  "{selectedDoc.latinText}"
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SCAN ARCHIVE HISTORY QUICKVIEW */}
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4.5 h-4.5 text-[#C5A059]" />
            <h4 className="text-sm font-serif font-semibold text-stone-100">
              Historija Nedavnih Analiza
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scansHistory.map((scan) => (
              <div
                key={scan.id}
                className="p-3 rounded-xl bg-black border border-[#2A2A2A] hover:border-[#C5A059]/40 transition-all flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-serif font-bold text-[#C5A059] truncate mb-0.5">
                    {scan.title}
                  </p>
                  <p className="text-[10px] text-stone-500 truncate">
                    {scan.fileName} • {scan.date}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-emerald-400 font-mono font-bold">
                    {scan.accuracy}% tačnost
                  </div>
                  <div className="text-[9px] text-stone-500 font-mono">
                    {scan.durationMs}ms
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
