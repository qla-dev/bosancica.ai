import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createOcrJob, OcrJob, waitForOcrJob } from '../api/ocrJobs';
import { PRESET_DOCUMENTS } from '../data';
import { PresetDocument, ScanItem } from '../types';
import BosancicaHoverText from './BosancicaHoverText';
import EditableLatinText from './EditableLatinText';
import { CalendarClock, FileText, CheckCircle2, MapPin, Pencil, RefreshCw, Layers, X } from 'lucide-react';
import Button from './ui/Button';
import PrimaryButton from './ui/PrimaryButton';

export type ScanProcessStage = 'idle' | 'segmenting' | 'segmented' | 'transliterating' | 'complete' | 'failed';

export interface ScanProcessStatus {
  stage: ScanProcessStage;
  progress: number;
  segmentationModel?: string;
  transliterationModel?: string;
}

export interface ScanWorkflowHandle {
  startSegmentation: () => void;
  startTransliteration: () => void;
}

interface ScanWorkflowProps {
  key?: string;
  onScanCompleted: (newScan: ScanItem) => void;
  initialFiles?: File[];
  initialPresetId?: string | null;
  initialDocumentName?: string;
  modelName?: string;
  focusDocumentView?: boolean;
  researcherReviewed: boolean;
  onResearcherReviewedChange: (reviewed: boolean) => void;
  onReviewAvailabilityChange: (available: boolean) => void;
  onProcessStatusChange: (status: ScanProcessStatus) => void;
}

type CustomDocument = {
  name: string;
  url: string;
  file: File;
  doc: PresetDocument;
  job?: OcrJob | null;
};

const terminalFailureStatuses = new Set(['failed', 'model_missing']);

const normalizeOcrLineText = (line: unknown) => {
  if (typeof line === 'string') return line.trim();
  if (line && typeof line === 'object' && 'text' in line) {
    const text = (line as { text?: unknown }).text;
    return typeof text === 'string' ? text.trim() : '';
  }

  return '';
};

const ocrLinesFromJob = (job: OcrJob) => {
  const structuredLines = Array.isArray(job.output_lines)
    ? job.output_lines.map(normalizeOcrLineText).filter(Boolean)
    : [];

  if (structuredLines.length) return structuredLines;

  return (job.output_text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const documentFromOcrJob = (item: CustomDocument, job: OcrJob): PresetDocument => {
  const lineTexts = ocrLinesFromJob(job);
  const fallbackText = job.output_text?.trim() || item.doc.latinText;
  const safeLines = lineTexts.length ? lineTexts : [fallbackText].filter(Boolean);
  const lineHeight = Math.max(9, Math.min(18, 72 / Math.max(safeLines.length, 1)));
  const lineStep = 76 / Math.max(safeLines.length, 1);

  return {
    ...item.doc,
    rawBosančicaText: fallbackText,
    latinText: safeLines.join(' '),
    lines: safeLines.map((text, index) => ({
      textBosančica: text,
      textLatinica: text,
      top: 12 + (index * lineStep),
      height: lineHeight,
    })),
  };
};

const scanHistoryDate = () => {
  const now = new Date();
  return `Danas, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const ScanWorkflow = forwardRef<ScanWorkflowHandle, ScanWorkflowProps>(function ScanWorkflow({
  onScanCompleted,
  initialFiles = [],
  initialPresetId,
  initialDocumentName,
  modelName = 'Kraken BVision OCR',
  focusDocumentView = false,
  researcherReviewed,
  onResearcherReviewedChange,
  onReviewAvailabilityChange,
  onProcessStatusChange,
}: ScanWorkflowProps, ref) {
  const [selectedDoc, setSelectedDoc] = useState<PresetDocument>(PRESET_DOCUMENTS[0]);
  const [editedLines, setEditedLines] = useState<string[]>(() => PRESET_DOCUMENTS[0].lines.map((line) => line.textLatinica));
  const [processStage, setProcessStage] = useState<ScanProcessStage>('complete');
  const [scanProgress, setScanProgress] = useState(0);
  const [completedModels, setCompletedModels] = useState({
    segmentationModel: modelName,
    transliterationModel: modelName,
  });
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [editedLocation, setEditedLocation] = useState(PRESET_DOCUMENTS[0].origin);
  const [locationDraft, setLocationDraft] = useState(PRESET_DOCUMENTS[0].origin);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [customDocuments, setCustomDocuments] = useState<CustomDocument[]>([]);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [processedAt] = useState(() => {
    const date = new Date();
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  });
  const processIntervalRef = useRef<number | null>(null);
  const processCompletionRef = useRef<number | null>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);
  const isProcessing = processStage === 'segmenting' || processStage === 'transliterating';
  const isScanning = isProcessing;
  const showResult = processStage === 'complete';
  const hasProcessFailed = processStage === 'failed';

  const handleSelectPreset = (doc: PresetDocument) => {
    if (isProcessing) return;
    setApiErrorMessage(null);
    setSelectedDoc(doc);
    setProcessStage('complete');
    setScanProgress(100);
    setActiveLine(null);
    onResearcherReviewedChange(false);
  };

  const makeCustomDocument = (file: File, index: number) => {
      const isImage = file.type.startsWith('image/');
      const fakeUrl = isImage
        ? URL.createObjectURL(file)
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1300" viewBox="0 0 1000 1300">
              <rect width="1000" height="1300" fill="#d6c49f"/>
              <rect x="90" y="90" width="820" height="1120" rx="20" fill="#eee3ca" stroke="#8f7952" stroke-width="5"/>
              <text x="500" y="590" text-anchor="middle" font-family="serif" font-size="150" fill="#6f5834">PDF</text>
              <text x="500" y="690" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#77684d">${file.name.replace(/[<>&]/g, '')}</text>
            </svg>
          `)}`;
      const fakeDoc: PresetDocument = {
        id: `custom-${file.lastModified}-${index}`,
        title: initialDocumentName
          ? `${initialDocumentName}${initialFiles.length > 1 ? ` Â· ${index + 1}` : ''}`
          : file.name.substring(0, 24) || 'Uvezeni dokument',
        year: 'Nepoznat period',
        origin: 'UÄitano sa lokalnog raÄunara',
        imageUrl: fakeUrl,
        rawBosančicaText: 'â°– â°‰â°â°… â°‘â°ªA â°‰ â°”â°‰â°A â°‰ â°”â°‚â°…â°•â°‘â°ƒA â°„â°–â°˜A.',
        latinText: 'Automatski detektovan tekst u starom bosanskom pismu.',
        lines: [
          {
            textBosančica: 'â°– â°‰â°â°… â°‘â°ªA â°‰ â°”â°‰â°A',
            textLatinica: 'U ime oca i sina i svetoga duha.',
            top: 30,
            height: 20
          },
          {
            textBosančica: 'â°¡ â°Aâ°â°  â°â°‘â°”â°â° â°”â°â°‰ â°â°– Jews',
            textLatinica: 'Ja, ban bosanski, svedoÄim narodu.',
            top: 60,
            height: 20
          }
        ]
      };
      return { name: file.name, url: fakeUrl, file, doc: fakeDoc };
  };

  const loadCustomFiles = (files: File[]) => {
      const documents = files
        .filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf')
        .map(makeCustomDocument);
      if (!documents.length) return;
      setCustomDocuments(documents);
      setSelectedDoc(documents[0].doc);
      setProcessStage('idle');
      setScanProgress(0);
      setCompletedModels({ segmentationModel: '', transliterationModel: '' });
      setApiErrorMessage(null);
      setActiveLine(null);
      onResearcherReviewedChange(false);
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
    setEditedLocation(selectedDoc.origin);
    setLocationDraft(selectedDoc.origin);
    setLocationModalOpen(false);
    onResearcherReviewedChange(false);
  }, [onResearcherReviewedChange, selectedDoc]);

  useEffect(() => {
    onReviewAvailabilityChange(processStage === 'complete');
    onProcessStatusChange({ stage: processStage, progress: scanProgress, ...completedModels });
  }, [completedModels, onProcessStatusChange, onReviewAvailabilityChange, processStage, scanProgress]);

  const segmentationComplete = ['segmented', 'transliterating', 'complete'].includes(processStage);
  const transliterationComplete = processStage === 'complete';
  const completedStatusCount = [segmentationComplete, transliterationComplete, researcherReviewed].filter(Boolean).length;
  const statusItems = [
    {
      label: hasProcessFailed
        ? 'Greska u obradi'
        : segmentationComplete
          ? 'Segmentacija gotova'
          : processStage === 'segmenting'
            ? 'Segmentacija u toku'
            : 'Ceka segmentaciju',
      complete: segmentationComplete,
    },
    {
      label: transliterationComplete
        ? 'Transliteracija gotova'
        : processStage === 'transliterating'
          ? 'Transliteracija u toku'
          : segmentationComplete
            ? 'Transliteracija spremna'
            : 'ÄŒeka transliteraciju',
      complete: transliterationComplete,
    },
    {
      label: researcherReviewed ? 'Kontrola istraÅ¾ivaÄa gotova' : 'Kontrola istraÅ¾ivaÄa Äeka',
      complete: researcherReviewed,
    },
  ];

  const clearProcessTimers = () => {
    if (processIntervalRef.current !== null) window.clearInterval(processIntervalRef.current);
    if (processCompletionRef.current !== null) window.clearTimeout(processCompletionRef.current);
    processIntervalRef.current = null;
    processCompletionRef.current = null;
  };

  const cancelOcrRequest = () => {
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = null;
  };

  useEffect(() => () => {
    clearProcessTimers();
    cancelOcrRequest();
  }, []);

  const runProcess = (stage: 'segmenting' | 'transliterating', onComplete: () => void) => {
    clearProcessTimers();
    cancelOcrRequest();
    setApiErrorMessage(null);
    setProcessStage(stage);
    setScanProgress(0);
    let progress = 0;

    processIntervalRef.current = window.setInterval(() => {
      progress = Math.min(100, progress + 10);
      setScanProgress(progress);
      if (progress < 100) return;

      if (processIntervalRef.current !== null) window.clearInterval(processIntervalRef.current);
      processIntervalRef.current = null;
      processCompletionRef.current = window.setTimeout(() => {
        processCompletionRef.current = null;
        onComplete();
      }, 250);
    }, 140);
  };

  const updateCustomDocument = (docId: string, updater: (item: CustomDocument) => CustomDocument) => {
    setCustomDocuments((current) => current.map((item) => (
      item.doc.id === docId ? updater(item) : item
    )));
  };

  const updatePollingProgress = (job: OcrJob, documentIndex: number, totalDocuments: number) => {
    const documentShare = 90 / Math.max(totalDocuments, 1);
    const documentBase = documentIndex * documentShare;
    const statusProgress = job.status === 'pending' ? 0.25 : 0.75;
    const nextProgress = Math.min(96, Math.round(8 + documentBase + (documentShare * statusProgress)));

    setScanProgress((current) => Math.max(current, nextProgress));
  };

  const runUploadedOcr = async (documents: CustomDocument[]) => {
    clearProcessTimers();
    cancelOcrRequest();

    const controller = new AbortController();
    ocrAbortRef.current = controller;

    setApiErrorMessage(null);
    setProcessStage('segmenting');
    setScanProgress(8);
    setCompletedModels({ segmentationModel: '', transliterationModel: '' });

    const processedDocuments: CustomDocument[] = [];

    try {
      for (const [index, item] of documents.entries()) {
        const createdJob = await createOcrJob({
          file: item.file,
          documentName: item.doc.title,
          modelName,
          signal: controller.signal,
        });

        updateCustomDocument(item.doc.id, (current) => ({ ...current, job: createdJob }));
        updatePollingProgress(createdJob, index, documents.length);

        const completedJob = await waitForOcrJob(
          createdJob.id,
          controller.signal,
          (job) => {
            updateCustomDocument(item.doc.id, (current) => ({ ...current, job }));
            updatePollingProgress(job, index, documents.length);
          },
        );

        if (terminalFailureStatuses.has(completedJob.status)) {
          throw new Error(
            completedJob.error_message
            || (completedJob.status === 'model_missing'
              ? 'Kraken model is missing on the backend server.'
              : 'OCR job failed on the backend server.'),
          );
        }

        processedDocuments.push({
          ...item,
          job: completedJob,
          doc: documentFromOcrJob(item, completedJob),
        });
      }

      if (controller.signal.aborted) return;

      setCustomDocuments(processedDocuments);
      setSelectedDoc((current) => (
        processedDocuments.find((item) => item.doc.id === current.id)?.doc
        ?? processedDocuments[0]?.doc
        ?? current
      ));
      setCompletedModels({ segmentationModel: modelName, transliterationModel: '' });
      setScanProgress(100);
      setProcessStage('segmented');
    } catch (error) {
      if (controller.signal.aborted) return;

      setApiErrorMessage(error instanceof Error ? error.message : 'OCR API request failed.');
      setCompletedModels({ segmentationModel: '', transliterationModel: '' });
      setScanProgress(0);
      setProcessStage('failed');
    } finally {
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
    }
  };

  const startSegmentation = () => {
    if (processStage !== 'idle' && processStage !== 'failed') return;
    onResearcherReviewedChange(false);

    if (customDocuments.length) {
      void runUploadedOcr(customDocuments);
      return;
    }

    runProcess('segmenting', () => {
      setCompletedModels((current) => ({ ...current, segmentationModel: modelName }));
      setProcessStage('segmented');
    });
  };

  const startTransliteration = () => {
    if (processStage !== 'segmented') return;
    runProcess('transliterating', () => {
      setCompletedModels((current) => ({ ...current, transliterationModel: modelName }));
      setProcessStage('complete');

      if (customDocuments.length) {
        customDocuments.forEach((item, index) => {
          const isSelected = item.doc.id === selectedDoc.id;
          const latinText = isSelected ? editedLines.join(' ') : item.doc.latinText;

          onScanCompleted({
            id: `scan-${item.job?.id ?? `${Date.now()}-${index}`}`,
            date: scanHistoryDate(),
            fileName: item.name,
            title: item.doc.title,
            rawBosančicaText: item.doc.rawBosančicaText,
            latinText,
            accuracy: Number(item.job?.confidence ?? 0),
            durationMs: Number(item.job?.duration_ms ?? 0),
          });
        });

        return;
      }

      const newHistoryItem: ScanItem = {
        id: `scan-${Date.now()}`,
        date: scanHistoryDate(),
        fileName: `${selectedDoc.title.toLowerCase().replace(/\s+/g, '_')}.jpg`,
        title: selectedDoc.title,
        rawBosančicaText: selectedDoc.rawBosančicaText,
        latinText: editedLines.join(' '),
        accuracy: parseFloat((94 + Math.random() * 5).toFixed(1)),
        durationMs: Math.floor(600 + Math.random() * 800),
      };
      onScanCompleted(newHistoryItem);

    });
  };

  useImperativeHandle(ref, () => ({ startSegmentation, startTransliteration }), [processStage, selectedDoc, editedLines, customDocuments]);

  return (
    <div className={`scan-workflow ${focusDocumentView ? 'scan-workflow--focused' : ''}`}>
      <section className="document-meta-panel">
        <div className="document-meta-panel__main">
          <span>Aktivni dokument</span>
          <h2>{selectedDoc.title}</h2>
          <p className="document-location">
            <MapPin size={13} />
            <span>{editedLocation} Â· {selectedDoc.year}</span>
            <Button
              type="button"
              className="document-location__edit"
              onClick={() => {
                setLocationDraft(editedLocation);
                setLocationModalOpen(true);
              }}
              aria-label="Uredi lokaciju"
              title="Uredi lokaciju"
            >
              <Pencil size={12} />
            </Button>
          </p>
        </div>

        <div className="document-meta-panel__status">
          <div className="document-meta-panel__progress-heading">
            <span>Napredak obrade</span>
            <strong>{completedStatusCount}/3</strong>
          </div>
          <div className="document-meta-panel__progress-track">
            <i style={{ width: `${(completedStatusCount / 3) * 100}%` }} />
          </div>

          <div className="document-status-list">
            {statusItems.map((item) => (
              <span key={item.label} className={item.complete ? 'is-complete' : ''}>
                <CheckCircle2 size={13} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="document-meta-panel__facts">
          <span><CalendarClock size={14} /> ObraÄ‘eno: {showResult ? processedAt : 'nije pokrenuto'}</span>
          <span><FileText size={14} /> Segmenti: {selectedDoc.lines.length}</span>
        </div>

      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT COLUMN: Preset selector & upload & active file preview */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* PRESET PAPERS */}
        {false && !focusDocumentView && (
        <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm">
          <legend className="text-xs font-serif font-bold text-[#C5A059] uppercase tracking-[0.2em] mb-4">
            Iskopine i Dokumenti
          </legend>
          <div className="flex flex-col gap-3">
            {PRESET_DOCUMENTS.map((doc) => (
              <Button
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
              </Button>
            ))}
          </div>

          {customDocuments.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#2A2A2A]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-stone-500 uppercase tracking-widest font-mono">UÄitani dokumenti</span>
                <span className="text-[9px] text-[#C5A059] font-mono">{customDocuments.length} slika</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
              {customDocuments.map((item, index) => (
                <Button
                  key={item.doc.id}
                  type="button"
                  onClick={() => {
                    if (isScanning) return;
                    setSelectedDoc(item.doc);
                    setProcessStage('idle');
                    setScanProgress(0);
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
                </Button>
              ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* WORKSPACE PREVIEW FRAME */}
        <div className="relative flex flex-col p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm overflow-hidden flex-1 select-none">
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
                  {hasProcessFailed
                    ? (apiErrorMessage ?? 'OCR API request failed.')
                    : processStage === 'segmented'
                    ? 'Segmentacija je zavrÅ¡ena. Pokrenite transliteraciju u zaglavlju.'
                    : `Pokrenite segmentaciju u zaglavlju za obradu modelom ${modelName}.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: OCR Outputs / Decoders side by side */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* OCR RESULTS BOX */}
        <div className="flex-1 p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm flex flex-col min-h-[450px]">
          <div className="flex items-center justify-between mb-6 border-b border-[#2A2A2A] pb-4">
            <div>
              <h3 className="text-lg font-serif font-semibold text-stone-100">
                AI rezultat i transliteracija
              </h3>
              <p className="text-xs text-stone-405 mt-0.5">
                Drevne ligature izdvojene modelom {modelName}
              </p>
            </div>
            {showResult && (
              <span className="px-3 py-1 text-xs rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                UspjeÅ¡no deÅ¡ifrovano
              </span>
            )}
          </div>

          {isScanning && (
            <div className="flex-grow flex flex-col items-center justify-center p-10 text-center animate-pulse">
              <RefreshCw className="w-8 h-8 text-[#C5A059] animate-spin mb-4" />
              <p className="text-sm text-stone-300 font-serif">
                {processStage === 'segmenting' ? 'Segmentiram redove dokumenta...' : 'DeÅ¡ifrujem ligaturna spajanja...'}
              </p>
              <p className="text-xs text-stone-500 mt-1">Napredak obrade: {scanProgress}%</p>
            </div>
          )}

          {!isScanning && !showResult && (
            <div className="flex-grow flex flex-col items-center justify-center p-12 text-center text-stone-500">
              <FileText className="w-12 h-12 text-[#2A2A2A] mb-3" />
              <p className="text-sm font-serif">
                {hasProcessFailed ? 'OCR API request failed.' : processStage === 'segmented' ? 'Segmentacija je spremna.' : 'ÄŒekam segmentaciju dokumenta...'}
              </p>
              <p className="text-xs text-stone-600 mt-0.5">
                {hasProcessFailed
                  ? (apiErrorMessage ?? 'Use Segmentacija to retry.')
                  : processStage === 'segmented'
                  ? 'Pokrenite transliteraciju iz zaglavlja.'
                  : 'Pokrenite prvi korak obrade iz zaglavlja.'}
              </p>
            </div>
          )}

          {showResult && !isScanning && (
            <div className="flex-grow flex flex-col gap-6">
              {/* LINE BY LINE BREAKDOWN */}
              <div className="flex flex-col gap-4">
                <legend className="text-xs font-serif uppercase tracking-[0.2em] text-[#C5A059]">
                  Transliteracija po segmentima reda
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
                          <BosancicaHoverText
                            value={editedLines[idx] ?? line.textLatinica}
                            onChange={(value) => {
                              onResearcherReviewedChange(false);
                              setEditedLines((current) =>
                                current.map((item, lineIndex) => lineIndex === idx ? value : item)
                              );
                            }}
                          />
                        </div>

                        {/* TRANSLATION LATINICA */}
                        <div className="flex flex-col gap-1.5 bg-[#1A1A1A]/30 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Savremena Latinica
                          </span>
                          <EditableLatinText
                            value={editedLines[idx] ?? line.textLatinica}
                            onChange={(value) => {
                              onResearcherReviewedChange(false);
                              setEditedLines((current) =>
                                current.map((item, lineIndex) => lineIndex === idx ? value : item)
                              );
                            }}
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
                  <span className="text-xs text-stone-400 font-serif">Kompletan LatiniÄni Tekst</span>
                  <PrimaryButton
                    onClick={() => {
                      navigator.clipboard.writeText(editedLines.join(' '));
                      alert('Tekst uspjeÅ¡no kopiran u meÄ‘umemoriju!');
                    }}
                    className="copy-text-button"
                  >
                    Kopiraj Tekst
                  </PrimaryButton>
                </div>
                <p className="text-xs text-[#E0E0E0] leading-relaxed italic">
                  "{editedLines.join(' ')}"
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>

      {locationModalOpen && (
        <div className="location-modal" role="presentation" onMouseDown={() => setLocationModalOpen(false)}>
          <form
            className="location-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const nextLocation = locationDraft.trim();
              if (nextLocation) setEditedLocation(nextLocation);
              setLocationModalOpen(false);
            }}
          >
            <div className="location-modal__header">
              <div>
                <span>Podaci dokumenta</span>
                <h3 id="location-modal-title">Uredi lokaciju</h3>
              </div>
              <Button type="button" onClick={() => setLocationModalOpen(false)} aria-label="Zatvori modal">
                <X size={17} />
              </Button>
            </div>
            <label htmlFor="document-location-input">Lokacija dokumenta</label>
            <input
              id="document-location-input"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="Unesite lokaciju"
              autoFocus
            />
            <div className="location-modal__actions">
              <Button type="button" onClick={() => setLocationModalOpen(false)}>Odustani</Button>
              <Button type="submit">SaÄuvaj lokaciju</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

export default ScanWorkflow;
