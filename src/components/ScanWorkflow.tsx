import React, { useEffect, useState } from 'react';
import { PRESET_DOCUMENTS } from '../data';
import { PresetDocument, ScanItem } from '../types';
import { toBosancicaFontInput } from '../bosancica';
import EditableLatinText from './EditableLatinText';
import { Cpu, FileText, CheckCircle2, History, RefreshCw, Layers } from 'lucide-react';

interface ScanWorkflowProps {
  key?: string;
  onScanCompleted: (newScan: ScanItem) => void;
  scansHistory: ScanItem[];
  initialFiles?: File[];
  initialPresetId?: string | null;
  modelName?: string;
}

export default function ScanWorkflow({
  onScanCompleted,
  scansHistory,
  initialFiles = [],
  initialPresetId,
  modelName = 'Kraken BVision OCR',
}: ScanWorkflowProps) {
  const [selectedDoc, setSelectedDoc] = useState<PresetDocument>(PRESET_DOCUMENTS[0]);
  const [editedLines, setEditedLines] = useState<string[]>(() => PRESET_DOCUMENTS[0].lines.map((line) => line.textLatinica));
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showResult, setShowResult] = useState(true);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [customDocuments, setCustomDocuments] = useState<Array<{ name: string; url: string; doc: PresetDocument }>>([]);

  const handleSelectPreset = (doc: PresetDocument) => {
    if (isScanning) return;
    setSelectedDoc(doc);
    setShowResult(true);
    setActiveLine(null);
  };

  const makeCustomDocument = (file: File, index: number) => {
      const fakeUrl = URL.createObjectURL(file);
      const fakeDoc: PresetDocument = {
        id: `custom-${file.lastModified}-${index}`,
        title: file.name.substring(0, 24) || 'Uvezeni dokument d.b',
        year: 'Nepoznat period',
        origin: 'Učitano sa lokalnog računara',
        imageUrl: fakeUrl,
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
      return { name: file.name, url: fakeUrl, doc: fakeDoc };
  };

  const loadCustomFiles = (files: File[]) => {
      const documents = files.filter((file) => file.type.startsWith('image/')).map(makeCustomDocument);
      if (!documents.length) return;
      setCustomDocuments(documents);
      setSelectedDoc(documents[0].doc);
      setShowResult(false);
      setActiveLine(null);
  };

  useEffect(() => {
    if (initialFiles.length) loadCustomFiles(initialFiles);
  }, [initialFiles]);

  useEffect(() => {
    if (!initialPresetId) return;
    const document = PRESET_DOCUMENTS.find((item) => item.id === initialPresetId);
    if (document) handleSelectPreset(document);
  }, [initialPresetId]);

  useEffect(() => {
    setEditedLines(selectedDoc.lines.map((line) => line.textLatinica));
  }, [selectedDoc]);

  const customFile = customDocuments.find((item) => item.doc.id === selectedDoc.id) ?? null;

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
              latinText: editedLines.join(' '),
              accuracy: parseFloat((94 + Math.random() * 5).toFixed(1)),
              durationMs: Math.floor(600 + Math.random() * 800)
            };
            onScanCompleted(newHistoryItem);

            if (customFile && customDocuments.length > 1) {
              customDocuments
                .filter((item) => item.doc.id !== selectedDoc.id)
                .forEach((item, index) => {
                  onScanCompleted({
                    id: `scan-${Date.now()}-${index + 1}`,
                    date: 'Danas, uzastopni test',
                    fileName: item.name,
                    ...item.doc,
                    title: item.doc.title,
                    /* Preserve the source OCR field through the spread above.
                    rawBosanÄicaText: item.doc.rawBosanÄicaText,
                    */
                    latinText: item.doc.latinText,
                    accuracy: parseFloat((94 + Math.random() * 5).toFixed(1)),
                    durationMs: Math.floor(600 + Math.random() * 800)
                  });
                });
            }
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

          {customDocuments.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#2A2A2A]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-stone-500 uppercase tracking-widest font-mono">Učitani dokumenti</span>
                <span className="text-[9px] text-[#C5A059] font-mono">{customDocuments.length} slika</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
              {customDocuments.map((item, index) => (
                <button
                  key={item.doc.id}
                  type="button"
                  onClick={() => {
                    if (isScanning) return;
                    setSelectedDoc(item.doc);
                    setShowResult(false);
                    setActiveLine(null);
                  }}
                  className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border transition-all ${
                    selectedDoc.id === item.doc.id ? 'border-[#C5A059]' : 'border-[#2A2A2A] opacity-60 hover:opacity-100'
                  }`}
                  title={`${index + 1}. ${item.name}`}
                >
                  <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 min-w-4 h-4 px-1 grid place-items-center rounded bg-black/80 text-[8px] text-[#C5A059] font-mono">
                    {index + 1}
                  </span>
                </button>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* WORKSPACE PREVIEW FRAME */}
        <div className="relative flex flex-col p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm overflow-hidden flex-1 select-none">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <span className="px-2 py-0.5 rounded bg-[#0A0A0A] border border-[#2A2A2A] text-[9px] text-[#C5A059]/80 font-mono">
              Rezolucija: 4K UHD
            </span>
          </div>

          <p className="text-xs font-serif text-[#C5A059] uppercase tracking-[0.2em] mb-3">
            Vizuelni segmenter ({modelName})
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
                  Pritisnite dugme ispod za pokretanje AI segmentacije i prevođenja modelom {modelName}.
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
                  <span>
                    Pokreni AI Transkripciju{customDocuments.length > 1 ? ` (${customDocuments.length} slika)` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: OCR Outputs / Decoders side by side & Scans Counter */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* COUNTER & PERFORMANCE HUDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        </div>

        {/* OCR RESULTS BOX */}
        <div className="flex-1 p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm flex flex-col min-h-[450px]">
          <div className="flex items-center justify-between mb-6 border-b border-[#2A2A2A] pb-4">
            <div>
              <h3 className="text-lg font-serif font-semibold text-stone-100">
                AI Rezultat i Transkripcija
              </h3>
              <p className="text-xs text-stone-405 mt-0.5">
                Drevne ligature izdvojene modelom {modelName}
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
                            Digitalna Bosančica
                          </span>
                          <p className="text-2xl font-bosanko text-[#C5A059] hover:text-[#D4B069] transition-colors tracking-wide break-words">
                            {toBosancicaFontInput(line.textLatinica)}
                          </p>
                        </div>

                        {/* TRANSLATION LATINICA */}
                        <div className="flex flex-col gap-1.5 bg-[#1A1A1A]/30 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Savremena Latinica
                          </span>
                          <EditableLatinText
                            value={editedLines[idx] ?? line.textLatinica}
                            onChange={(value) => setEditedLines((current) =>
                              current.map((item, lineIndex) => lineIndex === idx ? value : item)
                            )}
                          />
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
                      navigator.clipboard.writeText(editedLines.join(' '));
                      alert('Tekst uspješno kopiran u međumemoriju!');
                    }}
                    className="text-[10px] text-[#C5A059] font-bold hover:text-[#D4B069] cursor-pointer"
                  >
                    Kopiraj Tekst
                  </button>
                </div>
                <p className="text-xs text-[#E0E0E0] leading-relaxed italic">
                  "{editedLines.join(' ')}"
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
