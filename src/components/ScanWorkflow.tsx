import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  createOcrJob,
  createSegmentJob,
  cancelOcrJob,
  cancelSegmentJob,
  OcrJob,
  SegmentJob,
  SegmentLine,
  getSegmentJobDocumentUrl,
  getSegmentJobLineImageUrl,
  retryOcrJob,
  retrySegmentJob,
  normalizeModernBosnian,
  type NormalizationResult,
  waitForOcrJob,
  waitForSegmentJob,
} from '../api/ocrJobs';
import { createResearcherCorrection } from '../api/researcherCorrections';
import { PRESET_DOCUMENTS } from '../data';
import { toBosancicaFontInput, transliterateBosancicaToLatin } from '../bosancica';
import { translateUiText, type AppLanguage } from '../i18n';
import { PresetDocument, ScanItem } from '../types';
import BosancicaHoverText from './BosancicaHoverText';
import EditableLatinText from './EditableLatinText';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, FileText, CheckCircle2, MapPin, Pencil, RefreshCw, Layers, X, Download, ChevronDown, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Tags } from 'lucide-react';
import Button from './ui/Button';
import PrimaryButton from './ui/PrimaryButton';

export type ScanProcessStage = 'idle' | 'segmenting' | 'segmented' | 'transliterating' | 'normalizing' | 'complete' | 'failed' | 'cancelled';

export interface ScanProcessStatus {
  stage: ScanProcessStage;
  progress: number;
  jobId?: number;
  segmentationModel?: string;
  transliterationModel?: string;
  normalizationModel?: string;
  normalizationStatus?: 'idle' | 'running' | 'completed' | 'failed';
}

export interface ScanWorkflowHandle {
  startSegmentation: () => void;
  startTransliteration: () => void;
  startNormalization: () => void;
  cancelProcess: () => void;
  showSegmentation: () => void;
  showTransliteration: () => void;
  confirmResearcherReview: () => Promise<boolean>;
}

interface ScanWorkflowProps {
  key?: string;
  onScanCompleted: (newScan: ScanItem) => void;
  initialFiles?: File[];
  initialUploadBatchId?: string | null;
  initialPresetId?: string | null;
  initialSegmentJob?: SegmentJob | null;
  initialDocumentName?: string;
  modelId?: string;
  modelName?: string;
  focusDocumentView?: boolean;
  researcherReviewed: boolean;
  onResearcherReviewedChange: (reviewed: boolean) => void;
  onReviewAvailabilityChange: (available: boolean) => void;
  onProcessStatusChange: (status: ScanProcessStatus) => void;
  onSegmentHistoryChange?: () => void;
  resumeProgress?: number;
  language: AppLanguage;
}

type CustomDocument = {
  name: string;
  url: string;
  file: File;
  doc: PresetDocument;
  ocrJob?: OcrJob | null;
  segmentJob?: SegmentJob | null;
};

const terminalOcrFailureStatuses = new Set(['failed', 'model_missing']);
const SEGMENTATION_FAILURE_MESSAGE = 'Segmentation could not be completed. Please try again.';
const TRANSLITERATION_FAILURE_MESSAGE = 'Transliteration could not be completed. Please try again.';

const clampPercentage = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
};

const clampLineBox = (
  line: {
    left?: number | null;
    top?: number | null;
    width?: number | null;
    height?: number | null;
  },
  fallbackTop: number,
  fallbackHeight: number,
) => {
  const left = Math.min(98, clampPercentage(typeof line.left === 'number' ? line.left : 4, 4));
  const top = Math.min(98, clampPercentage(typeof line.top === 'number' ? line.top : fallbackTop, fallbackTop));
  const rawWidth = clampPercentage(typeof line.width === 'number' ? line.width : 92, 92);
  const rawHeight = clampPercentage(typeof line.height === 'number' ? line.height : fallbackHeight, fallbackHeight);

  return {
    left,
    top,
    width: Math.max(2, Math.min(rawWidth, 100 - left)),
    height: Math.max(2, Math.min(rawHeight, 100 - top)),
  };
};

type ResultView = 'segmentation' | 'transliteration';
type FullTextScript = 'latinica' | 'bosancica';
type ExportScript = FullTextScript | 'both';
type ExportFormat = 'txt' | 'doc' | 'pdf';
type TranscriptionSnapshot = { latin: string[]; bosancica: string[] };
type DraftStatus = 'saved' | 'saving' | 'restored';

const OCR_DRAFT_STORAGE_PREFIX = 'bosancica.ocr-draft.';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const safeDownloadName = (value: string) => (
  value.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'bosancica-ocr'
);

const lineBoxFromSegment = (
  line: SegmentLine,
  segment: SegmentJob,
  fallbackTop: number,
  fallbackHeight: number,
) => {
  const responseMetadata = segment.kraken_response?.metadata;
  const width = segment.output_metadata?.width ?? responseMetadata?.width;
  const height = segment.output_metadata?.height ?? responseMetadata?.height;
  const imageWidth = typeof width === 'number' && width > 0 ? width : null;
  const imageHeight = typeof height === 'number' && height > 0 ? height : null;
  const bbox = Array.isArray(line.bbox) && line.bbox.length === 4
    && line.bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ? line.bbox as number[]
    : null;

  if (imageWidth && imageHeight && bbox) {
    const [left, top, right, bottom] = bbox;

    return clampLineBox({
      left: (left / imageWidth) * 100,
      top: (top / imageHeight) * 100,
      width: ((right - left) / imageWidth) * 100,
      height: ((bottom - top) / imageHeight) * 100,
    }, fallbackTop, fallbackHeight);
  }

  return clampLineBox(line, fallbackTop, fallbackHeight);
};

const normalizeOcrLineText = (line: unknown) => {
  if (typeof line === 'string') return line.trim();
  if (line && typeof line === 'object' && 'text' in line) {
    const text = (line as { text?: unknown }).text;
    return typeof text === 'string' ? text.trim() : '';
  }

  return '';
};

const ocrLinesFromJob = (job: OcrJob, preserveEmptyLines = false) => {
  const structuredLines = Array.isArray(job.output_lines)
    ? job.output_lines
      .map(normalizeOcrLineText)
      .filter((line) => preserveEmptyLines || Boolean(line))
    : [];

  if (structuredLines.length) return structuredLines;

  return (job.output_text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const pdfPreviewUrl = (title: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1300" viewBox="0 0 1000 1300">
    <rect width="1000" height="1300" fill="#d6c49f"/>
    <rect x="90" y="90" width="820" height="1120" rx="20" fill="#eee3ca" stroke="#8f7952" stroke-width="5"/>
    <text x="500" y="590" text-anchor="middle" font-family="serif" font-size="150" fill="#6f5834">PDF</text>
    <text x="500" y="690" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#77684d">${title.replace(/[<>&]/g, '')}</text>
  </svg>
`)}`;

const documentWithSegmentLines = (doc: PresetDocument, segment: SegmentJob): PresetDocument => {
  const segmentLines = Array.isArray(segment.output_lines) ? segment.output_lines : [];
  const safeLines = segmentLines.length ? segmentLines : [{ index: 1, top: 25, height: 18 }];
  const fallbackHeight = Math.max(8, Math.min(18, 72 / Math.max(safeLines.length, 1)));
  const fallbackStep = 76 / Math.max(safeLines.length, 1);
  const summary = `Segmentirano ${safeLines.length} redova.`;

  return {
    ...doc,
    previewFit: 'contain',
    rawBosančicaText: summary,
    latinText: summary,
    lines: safeLines.map((line, index) => {
      const box = lineBoxFromSegment(line, segment, 12 + (index * fallbackStep), fallbackHeight);

      return {
        // Segmentation establishes geometry only. Text belongs exclusively to
        // a completed OCR job; using "Segment N" here risks presenting a UI
        // placeholder as if it were an OCR/transliteration result.
        textBosančica: '',
        textLatinica: '',
        lineImageUrl: segment.id && line.line_image_path ? getSegmentJobLineImageUrl(segment.id, index + 1) : undefined,
        ...box,
      };
    }),
  };
};

const documentFromSegmentJob = (item: CustomDocument, segment: SegmentJob): PresetDocument => (
  documentWithSegmentLines(item.doc, segment)
);

const documentFromStoredSegmentJob = (segment: SegmentJob): PresetDocument => {
  const title = segment.document_name || segment.original_filename || `Dokument #${segment.id}`;
  const isPdf = segment.mime_type === 'application/pdf' || (segment.original_filename ?? '').toLowerCase().endsWith('.pdf');
  const imageUrl = isPdf ? pdfPreviewUrl(title) : getSegmentJobDocumentUrl(segment.id);

  return documentWithSegmentLines({
    id: `segment-job-${segment.id}`,
    title,
    year: 'Učitani dokument',
    origin: segment.model_name ? `Backend arhiva · ${segment.model_name}` : 'Backend arhiva',
    imageUrl,
    previewFit: 'contain',
    rawBosančicaText: '',
    latinText: '',
    lines: [{ textBosančica: '', textLatinica: '', top: 25, height: 18 }],
  }, segment);
};

const stageFromSegmentJob = (segment: SegmentJob): ScanProcessStage => {
  if (segment.ocr_job?.status === 'cancelled' || segment.status === 'cancelled') return 'cancelled';
  if (segment.status === 'segmented') return 'segmented';
  if (segment.status === 'failed') return 'failed';
  if (segment.status === 'pending' || segment.status === 'running') return 'segmenting';

  return 'idle';
};

const documentFromOcrJob = (item: Pick<CustomDocument, 'doc'>, job: OcrJob): PresetDocument => {
  // OCR of a saved segmentation returns exactly one result per approved crop.
  // Keep blank results too, otherwise a failed/blank recognition would shift
  // all following text onto the wrong bounding box.
  const lineTexts = ocrLinesFromJob(job, job.segment_job_id != null);
  const fallbackText = job.output_text?.trim() || item.doc.rawBosančicaText;
  const rawLines = lineTexts.length ? lineTexts : [fallbackText].filter(Boolean);
  const latinLines = rawLines.map(transliterateBosancicaToLatin);
  const lineHeight = Math.max(9, Math.min(18, 72 / Math.max(rawLines.length, 1)));
  const lineStep = 76 / Math.max(rawLines.length, 1);

  return {
    ...item.doc,
    rawBosančicaText: fallbackText,
    latinText: latinLines.join(' '),
    lines: rawLines.map((text, index) => {
      const geometry = item.doc.lines[index];

      return {
        textBosančica: text,
        textLatinica: latinLines[index],
        lineImageUrl: geometry?.lineImageUrl,
        left: geometry?.left,
        width: geometry?.width,
        top: geometry?.top ?? 12 + (index * lineStep),
        height: geometry?.height ?? lineHeight,
      };
    }),
  };
};

const scanHistoryDate = () => {
  const now = new Date();
  return `Danas, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const ScanWorkflow = forwardRef<ScanWorkflowHandle, ScanWorkflowProps>(function ScanWorkflow({
  onScanCompleted,
  initialFiles = [],
  initialUploadBatchId,
  initialPresetId,
  initialSegmentJob,
  initialDocumentName,
  modelId,
  modelName = 'Kraken BVision OCR',
  focusDocumentView = false,
  researcherReviewed,
  onResearcherReviewedChange,
  onReviewAvailabilityChange,
  onProcessStatusChange,
  onSegmentHistoryChange,
  resumeProgress,
  language,
}: ScanWorkflowProps, ref) {
  const initialSelectedDocument = initialSegmentJob ? documentFromStoredSegmentJob(initialSegmentJob) : PRESET_DOCUMENTS[0];
  const [selectedDoc, setSelectedDoc] = useState<PresetDocument>(initialSelectedDocument);
  const [editedLines, setEditedLines] = useState<string[]>(() => initialSelectedDocument.lines.map((line) => line.textLatinica));
  const [editedBosancicaLines, setEditedBosancicaLines] = useState<string[]>(() => (
    initialSelectedDocument.lines.map((line) => line.textBosančica)
  ));
  const [processStage, setProcessStage] = useState<ScanProcessStage>(() => (
    initialSegmentJob?.ocr_job?.status === 'completed' ? 'complete' : initialSegmentJob ? stageFromSegmentJob(initialSegmentJob) : 'complete'
  ));
  const [scanProgress, setScanProgress] = useState(() => resumeProgress ?? (
    initialSegmentJob?.status === 'segmented' ? 100
      : initialSegmentJob?.status === 'running' ? 60
        : initialSegmentJob?.status === 'pending' ? 12
          : 0
  ));
  const [completedModels, setCompletedModels] = useState({
    segmentationModel: initialSegmentJob?.model_name ?? modelName,
    transliterationModel: initialSegmentJob?.ocr_job?.status === 'completed' ? initialSegmentJob.ocr_job.model_name ?? modelName : '',
  });
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showLineLabels, setShowLineLabels] = useState(true);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('saved');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editedLocation, setEditedLocation] = useState(PRESET_DOCUMENTS[0].origin);
  const [locationDraft, setLocationDraft] = useState(PRESET_DOCUMENTS[0].origin);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [customDocuments, setCustomDocuments] = useState<CustomDocument[]>([]);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [storedSegmentJob, setStoredSegmentJob] = useState<SegmentJob | null>(initialSegmentJob ?? null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [fullTextScript, setFullTextScript] = useState<FullTextScript>('latinica');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuOpenUpward, setExportMenuOpenUpward] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [normalizationExportMenuOpen, setNormalizationExportMenuOpen] = useState(false);
  const normalizationExportMenuRef = useRef<HTMLDivElement>(null);
  const [resultView, setResultView] = useState<ResultView>(() => (
    initialSegmentJob?.ocr_job?.status === 'completed' ? 'transliteration' : initialSegmentJob ? 'segmentation' : 'transliteration'
  ));
  const [processedAt] = useState(() => {
    const date = new Date();
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  });
  const [normalization, setNormalization] = useState<NormalizationResult | null>(() => initialSegmentJob?.ocr_job?.normalization ?? null);
  const [normalizationOnly, setNormalizationOnly] = useState(() => Boolean(initialSegmentJob?.ocr_job?.normalization));
  const [normalizationStatus, setNormalizationStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>(() => (
    initialSegmentJob?.ocr_job?.normalization ? 'completed' : 'idle'
  ));
  const t = (value: string) => translateUiText(value, language);
  const processIntervalRef = useRef<number | null>(null);
  const processCompletionRef = useRef<number | null>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);
  const activeRemoteJobRef = useRef<{ type: 'segment' | 'ocr'; id: number } | null>(null);
  const copyToastTimeoutRef = useRef<number | null>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const suppressLineClickRef = useRef(false);
  const [previewImageSize, setPreviewImageSize] = useState<{ width: number; height: number } | null>(null);
  const [containedImageBounds, setContainedImageBounds] = useState<{ width: number; height: number; left: number; top: number } | null>(null);
  const undoHistoryRef = useRef<TranscriptionSnapshot[]>([]);
  const redoHistoryRef = useRef<TranscriptionSnapshot[]>([]);
  const isProcessing = processStage === 'segmenting' || processStage === 'transliterating' || processStage === 'normalizing';
  const isScanning = isProcessing;
  const canViewSegmentation = ['segmented', 'complete'].includes(processStage);
  const canViewTransliteration = processStage === 'complete';
  const showSegmentRows = canViewSegmentation && resultView === 'segmentation';
  const showResult = canViewTransliteration && resultView === 'transliteration';
  const hasProcessFailed = processStage === 'failed';

  const handleSelectPreset = (doc: PresetDocument) => {
    if (isProcessing) return;
    setApiErrorMessage(null);
    setSelectedDoc(doc);
    setProcessStage('complete');
    setResultView('transliteration');
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
          ? `${initialDocumentName}${initialFiles.length > 1 ? ` · ${index + 1}` : ''}`
          : file.name.substring(0, 24) || 'Uvezeni dokument',
        year: 'Nepoznat period',
        origin: 'Učitano sa lokalnog računara',
        imageUrl: fakeUrl,
        previewFit: 'contain',
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
            textBosančica: 'Ⱑ ⰁAⰐⰠ ⰁⰑⰔⰐⰠⰔⰍⰉ ⰍⰖⰎⰉⰐⰠ',
            textLatinica: 'Ja, ban bosanski, svjedočim narodu.',
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
      setResultView('segmentation');
      setScanProgress(0);
      setCompletedModels({ segmentationModel: '', transliterationModel: '' });
      setApiErrorMessage(null);
      setActiveLine(null);
      onResearcherReviewedChange(false);
      void runUploadedSegmentation(documents);
  };

  const clientRequestIdForSegment = (item: CustomDocument) => {
    if (!initialUploadBatchId) return undefined;

    return [
      initialUploadBatchId,
      item.doc.id,
      modelId || modelName,
      item.file.name,
      item.file.size,
      item.file.lastModified,
    ].join(':');
  };

  useEffect(() => {
    if (initialFiles.length) loadCustomFiles(initialFiles);
  }, [initialFiles]);

  useEffect(() => {
    if (!initialSegmentJob) return;

    const document = documentFromStoredSegmentJob(initialSegmentJob);
    setCustomDocuments([]);
    const ocrJob = initialSegmentJob.ocr_job;
    const savedNormalization = ocrJob?.normalization ?? null;
    setNormalization(savedNormalization);
    setNormalizationOnly(Boolean(savedNormalization));
    setNormalizationStatus(savedNormalization ? 'completed' : 'idle');
    setSelectedDoc(ocrJob?.status === 'completed' ? documentFromOcrJob({ doc: document }, ocrJob) : document);
    setProcessStage(ocrJob?.status === 'completed' ? 'complete' : stageFromSegmentJob(initialSegmentJob));
    setResultView(ocrJob?.status === 'completed' ? 'transliteration' : 'segmentation');
    setScanProgress(resumeProgress ?? (initialSegmentJob.status === 'segmented' ? 100 : initialSegmentJob.status === 'running' ? 60 : initialSegmentJob.status === 'pending' ? 12 : 0));
    setCompletedModels({
      segmentationModel: initialSegmentJob.model_name ?? modelName,
      transliterationModel: ocrJob?.status === 'completed' ? ocrJob.model_name ?? modelName : '',
    });
    setApiErrorMessage(initialSegmentJob.error_message ? SEGMENTATION_FAILURE_MESSAGE : null);
    setStoredSegmentJob(initialSegmentJob);
    setActiveLine(null);
    onResearcherReviewedChange(false);
  }, [initialSegmentJob?.id, initialSegmentJob?.status, initialSegmentJob?.ocr_job?.status]);

  useEffect(() => {
    if (typeof resumeProgress !== 'number' || !['segmenting', 'transliterating'].includes(processStage)) return;
    setScanProgress((current) => Math.max(current, resumeProgress));
  }, [processStage, resumeProgress]);

  // When this document is reopened while its server-side job is still active,
  // resume the visual ticker here as well. The queue keeps running regardless
  // of navigation; this makes the returning view continue rather than freeze
  // at the last stored estimate.
  useEffect(() => {
    if (!initialSegmentJob || !['pending', 'running'].includes(initialSegmentJob.status)) return;

    const resumeTicker = window.setInterval(() => {
      setScanProgress((current) => Math.min(90, current + 1));
    }, 1_000);

    return () => window.clearInterval(resumeTicker);
  }, [initialSegmentJob?.id, initialSegmentJob?.status]);

  useEffect(() => {
    if (!initialPresetId) return;
    const document = PRESET_DOCUMENTS.find((item) => item.id === initialPresetId);
    if (document) handleSelectPreset(document);
  }, [initialPresetId]);

  useEffect(() => {
    const defaultLatin = selectedDoc.lines.map((line) => line.textLatinica);
    const defaultBosancica = selectedDoc.lines.map((line) => line.textBosančica);
    let restoredDraft: { latin?: unknown; bosancica?: unknown; location?: unknown } | null = null;
    try {
      restoredDraft = JSON.parse(window.localStorage.getItem(`${OCR_DRAFT_STORAGE_PREFIX}${selectedDoc.id}`) ?? 'null');
    } catch {
      restoredDraft = null;
    }

    const latin = Array.isArray(restoredDraft?.latin) && restoredDraft.latin.every((value) => typeof value === 'string')
      ? restoredDraft.latin as string[]
      : defaultLatin;
    const bosancica = Array.isArray(restoredDraft?.bosancica) && restoredDraft.bosancica.every((value) => typeof value === 'string')
      ? restoredDraft.bosancica as string[]
      : defaultBosancica;
    const location = typeof restoredDraft?.location === 'string' ? restoredDraft.location : selectedDoc.origin;

    setEditedLines(latin.length === defaultLatin.length ? latin : defaultLatin);
    setEditedBosancicaLines(bosancica.length === defaultBosancica.length ? bosancica : defaultBosancica);
    setEditedLocation(location);
    setLocationDraft(location);
    setLocationModalOpen(false);
    setSelectedLine(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setHistoryVersion((version) => version + 1);
    setDraftStatus(restoredDraft ? 'restored' : 'saved');
    onResearcherReviewedChange(false);
  }, [onResearcherReviewedChange, selectedDoc]);

  useEffect(() => {
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`${OCR_DRAFT_STORAGE_PREFIX}${selectedDoc.id}`, JSON.stringify({
          latin: editedLines,
          bosancica: editedBosancicaLines,
          location: editedLocation,
          savedAt: Date.now(),
        }));
        setDraftStatus('saved');
      } catch {
        // Draft persistence is a convenience and must never interrupt editing.
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [editedBosancicaLines, editedLines, editedLocation, selectedDoc.id]);

  const applyTranscriptionChange = (nextLatin: string[], nextBosancica: string[]) => {
    const current: TranscriptionSnapshot = { latin: editedLines, bosancica: editedBosancicaLines };
    if (current.latin.join('\u0000') === nextLatin.join('\u0000') && current.bosancica.join('\u0000') === nextBosancica.join('\u0000')) return;

    undoHistoryRef.current = [...undoHistoryRef.current.slice(-49), current];
    redoHistoryRef.current = [];
      setEditedLines(nextLatin);
      setEditedBosancicaLines(nextBosancica);
      setNormalization(null);
      setNormalizationStatus('idle');
      setHistoryVersion((version) => version + 1);
    onResearcherReviewedChange(false);
  };

  const undoTranscriptionChange = () => {
    const previous = undoHistoryRef.current.at(-1);
    if (!previous) return;
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    redoHistoryRef.current = [...redoHistoryRef.current, { latin: editedLines, bosancica: editedBosancicaLines }];
    setEditedLines(previous.latin);
    setEditedBosancicaLines(previous.bosancica);
    setHistoryVersion((version) => version + 1);
    onResearcherReviewedChange(false);
  };

  const redoTranscriptionChange = () => {
    const next = redoHistoryRef.current.at(-1);
    if (!next) return;
    redoHistoryRef.current = redoHistoryRef.current.slice(0, -1);
    undoHistoryRef.current = [...undoHistoryRef.current, { latin: editedLines, bosancica: editedBosancicaLines }];
    setEditedLines(next.latin);
    setEditedBosancicaLines(next.bosancica);
    setHistoryVersion((version) => version + 1);
    onResearcherReviewedChange(false);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingText = target?.matches('textarea, input, [contenteditable="true"]');
      if (!event.ctrlKey && !event.metaKey) {
        if (isEditingText) return;
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          setZoom((value) => Math.min(3, Number((value + 0.2).toFixed(2))));
        } else if (event.key === '-') {
          event.preventDefault();
          setZoom((value) => Math.max(1, Number((value - 0.2).toFixed(2))));
        } else if (event.key === '0') {
          event.preventDefault();
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoTranscriptionChange(); else undoTranscriptionChange();
      } else if (key === 'y') {
        event.preventDefault();
        redoTranscriptionChange();
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  });

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return undefined;

    const zoomWithWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => Math.max(1, Math.min(3, Number((current + (event.deltaY < 0 ? 0.15 : -0.15)).toFixed(2)))));
    };

    viewport.addEventListener('wheel', zoomWithWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', zoomWithWheel);
  }, []);

  // `object-contain` can leave empty space around an image. Keep the annotation
  // layer sized to the rendered image rectangle, rather than the whole viewport.
  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport || !previewImageSize) return undefined;

    const updateImageBounds = () => {
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      if (!viewportWidth || !viewportHeight) return;

      const imageRatio = previewImageSize.width / previewImageSize.height;
      const viewportRatio = viewportWidth / viewportHeight;
      const width = viewportRatio > imageRatio ? viewportHeight * imageRatio : viewportWidth;
      const height = width / imageRatio;
      setContainedImageBounds({
        width,
        height,
        left: (viewportWidth - width) / 2,
        top: (viewportHeight - height) / 2,
      });
    };

    updateImageBounds();
    const observer = new ResizeObserver(updateImageBounds);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [previewImageSize]);

  useEffect(() => {
    onReviewAvailabilityChange(processStage === 'complete');
    onProcessStatusChange({ stage: processStage, progress: scanProgress, jobId: activeRemoteJobRef.current?.id ?? storedSegmentJob?.id ?? initialSegmentJob?.id, ...completedModels, normalizationModel: normalization?.model, normalizationStatus });
  }, [completedModels, normalization, normalizationStatus, onProcessStatusChange, onReviewAvailabilityChange, processStage, scanProgress]);

  const segmentationComplete = ['segmented', 'transliterating', 'complete'].includes(processStage);
  const transliterationComplete = processStage === 'complete';
  const stoppedProcess = storedSegmentJob?.ocr_job?.status === 'cancelled'
    ? 'Transliteracija'
    : 'Segmentacija';
  const documentProcessStatus = processStage === 'cancelled'
    ? `${stoppedProcess} zaustavljena`
    : processStage === 'segmenting'
      ? 'Segmentacija u toku'
      : processStage === 'transliterating'
        ? 'Transliteracija u toku'
        : processStage === 'normalizing'
          ? 'Normalizacija u toku'
          : processStage === 'complete'
            ? 'Transliteracija završena'
            : processStage === 'segmented'
              ? 'Segmentacija završena'
              : processStage === 'failed'
                ? 'Obrada nije uspjela'
                : 'Segmentacija nije pokrenuta';
  const completedStatusCount = [segmentationComplete, transliterationComplete, researcherReviewed].filter(Boolean).length;
  const statusItems = [
    {
      label: hasProcessFailed
        ? 'Greška u obradi'
        : segmentationComplete
          ? 'Segmentacija gotova'
          : processStage === 'segmenting'
            ? 'Segmentacija u toku'
            : 'Čeka segmentaciju',
      complete: segmentationComplete,
    },
    {
      label: transliterationComplete
        ? 'Transliteracija gotova'
        : processStage === 'transliterating'
          ? 'Transliteracija u toku'
          : segmentationComplete
            ? 'Transliteracija spremna'
            : 'Čeka transliteraciju',
      complete: transliterationComplete,
    },
    {
      label: researcherReviewed ? 'Kontrola istraživača gotova' : 'Kontrola istraživača čeka',
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
    if (copyToastTimeoutRef.current !== null) window.clearTimeout(copyToastTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!exportMenuOpen && !normalizationExportMenuOpen) return undefined;

    const closeMenu = (event: MouseEvent) => {
      if (
        !exportMenuRef.current?.contains(event.target as Node)
        && !normalizationExportMenuRef.current?.contains(event.target as Node)
      ) {
        setExportMenuOpen(false);
        setNormalizationExportMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
        setNormalizationExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [exportMenuOpen, normalizationExportMenuOpen]);

  const handleCopyText = async () => {
    try {
      const fullLatinText = editedLines.join(' ');
      await navigator.clipboard.writeText(
        fullTextScript === 'bosancica' ? editedBosancicaLines.join(' ') : fullLatinText,
      );
      setCopyToastVisible(true);
      if (copyToastTimeoutRef.current !== null) window.clearTimeout(copyToastTimeoutRef.current);
      copyToastTimeoutRef.current = window.setTimeout(() => setCopyToastVisible(false), 3000);
    } catch {
      // Do not confirm a copy that the browser was unable to complete.
    }
  };

  const normalizationText = () => (
    normalization?.paragraphs?.length
      ? normalization.paragraphs.join('\n\n')
      : normalization?.modern_bosnian ?? ''
  );

  const handleCopyNormalizationText = async () => {
    try {
      await navigator.clipboard.writeText(normalizationText());
      setCopyToastVisible(true);
      if (copyToastTimeoutRef.current !== null) window.clearTimeout(copyToastTimeoutRef.current);
      copyToastTimeoutRef.current = window.setTimeout(() => setCopyToastVisible(false), 3000);
    } catch {
      // Do not confirm a copy that the browser was unable to complete.
    }
  };

  const cancelProcess = async () => {
    const activeJob = activeRemoteJobRef.current
      ?? (storedSegmentJob?.ocr_job && ['pending', 'running'].includes(storedSegmentJob.ocr_job.status)
        ? { type: 'ocr' as const, id: storedSegmentJob.ocr_job.id }
        : storedSegmentJob && ['pending', 'running'].includes(storedSegmentJob.status)
          ? { type: 'segment' as const, id: storedSegmentJob.id }
          : null);
    clearProcessTimers();
    cancelOcrRequest();
    activeRemoteJobRef.current = null;
    if (activeJob) {
      const cancelledJob = await (activeJob.type === 'segment' ? cancelSegmentJob(activeJob.id) : cancelOcrJob(activeJob.id));
      if (activeJob.type === 'segment') {
        setStoredSegmentJob((current) => current ? { ...current, status: cancelledJob.status, error_message: cancelledJob.error_message } : current);
      } else {
        setStoredSegmentJob((current) => current ? { ...current, ocr_job: cancelledJob } : current);
      }
      onSegmentHistoryChange?.();
    }
    setApiErrorMessage('Obrada je zaustavljena.');
    setScanProgress(0);
    setProcessStage('cancelled');
  };

  const exportLineText = (script: ExportScript) => editedLines.map((latinText, index) => {
    const bosancicaText = editedBosancicaLines[index] ?? '';
    if (script === 'latinica') return latinText;
    if (script === 'bosancica') return bosancicaText;
    return `${bosancicaText}\n${latinText}`;
  }).join('\n');

  const exportDocumentHtml = (script: ExportScript) => {
    const sections = editedLines.map((latinText, index) => {
      const bosancicaText = editedBosancicaLines[index] ?? '';
      if (script === 'latinica') return `<p>${escapeHtml(latinText)}</p>`;
      if (script === 'bosancica') return `<p>${escapeHtml(bosancicaText)}</p>`;
      return `<p>${escapeHtml(bosancicaText)}<br>${escapeHtml(latinText)}</p>`;
    }).join('');

    return `<!doctype html><html lang="bs"><head><meta charset="utf-8"><style>
      body { color: #181512; font-family: Georgia, serif; line-height: 1.45; margin: 36px auto; max-width: 760px; }
      p { break-inside: avoid; margin: 0; white-space: pre-wrap; }
      @media print { body { margin: 18mm; } }
    </style></head><body>${sections}</body></html>`;
  };

  const downloadBlob = (content: BlobPart, mimeType: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = (format: ExportFormat, script: ExportScript) => {
    const fileBaseName = safeDownloadName(selectedDoc.title || 'bosancica-ocr');
    const scriptSuffix = script === 'both' ? 'oba-pisma' : script;

    if (format === 'txt') {
      downloadBlob(`\uFEFF${exportLineText(script)}\n`, 'text/plain;charset=utf-8', `${fileBaseName}-${scriptSuffix}.txt`);
    } else if (format === 'doc') {
      downloadBlob(`\uFEFF${exportDocumentHtml(script)}`, 'application/msword;charset=utf-8', `${fileBaseName}-${scriptSuffix}.doc`);
    } else {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(exportDocumentHtml(script));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 350);
    }

    setExportMenuOpen(false);
  };

  const handleNormalizationExport = (format: ExportFormat) => {
    const fileBaseName = safeDownloadName(selectedDoc.title || 'bosancica-ocr');
    const text = normalizationText();
    const documentHtml = `<!doctype html><html lang="bs"><head><meta charset="utf-8"><style>
      body { color: #181512; font-family: Georgia, serif; line-height: 1.55; margin: 36px auto; max-width: 760px; }
      p { break-inside: avoid; margin: 0 0 1em; white-space: pre-wrap; }
      @media print { body { margin: 18mm; } }
    </style></head><body>${text.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</body></html>`;

    if (format === 'txt') {
      downloadBlob(`\uFEFF${text}\n`, 'text/plain;charset=utf-8', `${fileBaseName}-normalizacija.txt`);
    } else if (format === 'doc') {
      downloadBlob(`\uFEFF${documentHtml}`, 'application/msword;charset=utf-8', `${fileBaseName}-normalizacija.doc`);
    } else {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(documentHtml);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 350);
    }

    setNormalizationExportMenuOpen(false);
  };

  const toggleExportMenu = () => {
    if (exportMenuOpen) {
      setExportMenuOpen(false);
      return;
    }

    setExportMenuOpen(true);
    window.requestAnimationFrame(() => {
      const trigger = exportMenuRef.current;
      const menu = trigger?.querySelector<HTMLElement>('[role="menu"]');
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerBounds.bottom;
      setExportMenuOpenUpward(menu.getBoundingClientRect().height + 12 > spaceBelow);
    });
  };

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

  const updateQueuedProgress = (status: string, documentIndex: number, totalDocuments: number) => {
    const documentShare = 90 / Math.max(totalDocuments, 1);
    const documentBase = documentIndex * documentShare;
    // The service reports only queued/running/complete, not granular work.
    // Keep the visual indicator smooth and use status only for small floors;
    // mapping `running` to 75% caused the conspicuous 30% -> 76% jumps.
    const nextProgress = status === 'segmented'
      ? Math.min(98, Math.round(8 + (((documentIndex + 1) / Math.max(totalDocuments, 1)) * 90)))
      : Math.min(20, Math.round(10 + documentBase));

    setScanProgress((current) => Math.max(current, nextProgress));
  };

  const runUploadedSegmentation = async (documents: CustomDocument[]) => {
    clearProcessTimers();
    cancelOcrRequest();

    const controller = new AbortController();
    ocrAbortRef.current = controller;

    setApiErrorMessage(null);
    setProcessStage('segmenting');
    setResultView('segmentation');
    setScanProgress(8);
    setCompletedModels({ segmentationModel: '', transliterationModel: '' });

    const processedDocuments: CustomDocument[] = [];
    let progress = 8;

    processIntervalRef.current = window.setInterval(() => {
      progress = Math.min(90, progress + 1);
      setScanProgress((current) => Math.max(current, progress));
    }, 500);

    try {
      for (const [index, item] of documents.entries()) {
        const createdJob = item.segmentJob
          ? await retrySegmentJob(item.segmentJob.id, { modelId, modelName, signal: controller.signal })
          : await createSegmentJob({
            file: item.file,
            documentName: item.doc.title,
            modelId,
            modelName,
            clientRequestId: clientRequestIdForSegment(item),
            signal: controller.signal,
          });

        activeRemoteJobRef.current = { type: 'segment', id: createdJob.id };
        updateCustomDocument(item.doc.id, (current) => ({ ...current, segmentJob: createdJob }));
        onSegmentHistoryChange?.();
        updateQueuedProgress(createdJob.status, index, documents.length);

        const completedJob = await waitForSegmentJob(
          createdJob.id,
          controller.signal,
          (job) => {
            updateCustomDocument(item.doc.id, (current) => ({ ...current, segmentJob: job }));
            updateQueuedProgress(job.status, index, documents.length);
          },
        );

        const finalJob = completedJob;
        if (finalJob.status !== 'segmented') throw new Error(SEGMENTATION_FAILURE_MESSAGE);

        const segmentedItem = {
          ...item,
          segmentJob: finalJob,
          doc: documentFromSegmentJob(item, finalJob),
        };

        updateCustomDocument(item.doc.id, () => segmentedItem);
        setStoredSegmentJob(finalJob);
        activeRemoteJobRef.current = null;
        processedDocuments.push(segmentedItem);
        setScanProgress(Math.min(98, Math.round(8 + (((index + 1) / documents.length) * 90))));
      }

      if (controller.signal.aborted) return;

      clearProcessTimers();
      setCustomDocuments(processedDocuments);
      setSelectedDoc((current) => (
        processedDocuments.find((item) => item.doc.id === current.id)?.doc
        ?? processedDocuments[0]?.doc
        ?? current
      ));
      setCompletedModels({ segmentationModel: modelName, transliterationModel: '' });
      setScanProgress(100);
      setProcessStage('segmented');
      setResultView('segmentation');
      onSegmentHistoryChange?.();
    } catch (error) {
      if (controller.signal.aborted) return;

      clearProcessTimers();
      setApiErrorMessage(SEGMENTATION_FAILURE_MESSAGE);
      setCompletedModels({ segmentationModel: '', transliterationModel: '' });
      setScanProgress(0);
      setProcessStage('failed');
    } finally {
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
    }
  };

  const runUploadedTransliteration = async (documents: CustomDocument[]) => {
    clearProcessTimers();
    cancelOcrRequest();

    const controller = new AbortController();
    ocrAbortRef.current = controller;

    setApiErrorMessage(null);
    setProcessStage('transliterating');
    setResultView('transliteration');
    setScanProgress(8);
    setCompletedModels((current) => ({ ...current, transliterationModel: '' }));

    const processedDocuments: CustomDocument[] = [];
    let progress = 8;

    processIntervalRef.current = window.setInterval(() => {
      progress = Math.min(90, progress + 4);
      setScanProgress((current) => Math.max(current, progress));
    }, 180);

    try {
      for (const [index, item] of documents.entries()) {
        const createdJob = await createOcrJob({
          // Reuse the saved, reviewed segmentation instead of segmenting the
          // original image for a second time in the OCR pipeline.
          segmentJobId: item.segmentJob?.id,
          file: item.segmentJob ? undefined : item.file,
          documentName: item.doc.title,
          modelId,
          modelName,
          signal: controller.signal,
        });

        activeRemoteJobRef.current = { type: 'ocr', id: createdJob.id };
        updateCustomDocument(item.doc.id, (current) => ({ ...current, ocrJob: createdJob }));
        updateQueuedProgress(createdJob.status, index, documents.length);

        const completedJob = await waitForOcrJob(
          createdJob.id,
          controller.signal,
          (job) => {
            updateCustomDocument(item.doc.id, (current) => ({ ...current, ocrJob: job }));
            updateQueuedProgress(job.status, index, documents.length);
          },
        );

        const finalJob = terminalOcrFailureStatuses.has(completedJob.status)
          ? await waitForOcrJob((await retryOcrJob(completedJob.id, controller.signal)).id, controller.signal)
          : completedJob;
        if (terminalOcrFailureStatuses.has(finalJob.status) || finalJob.status === 'cancelled') {
          throw new Error(TRANSLITERATION_FAILURE_MESSAGE);
        }

        // Segmentation view uses "Segment N" placeholders. Its browser draft
        // has the same line count as OCR output, so it must not be restored
        // over the newly recognized text.
        window.localStorage.removeItem(`${OCR_DRAFT_STORAGE_PREFIX}${item.doc.id}`);
        const ocrItem = {
          ...item,
          ocrJob: finalJob,
          doc: documentFromOcrJob(item, finalJob),
        };

        updateCustomDocument(item.doc.id, () => ocrItem);
        activeRemoteJobRef.current = null;
        processedDocuments.push(ocrItem);
        setScanProgress(Math.min(98, Math.round(8 + (((index + 1) / documents.length) * 90))));
      }

      if (controller.signal.aborted) return;

      clearProcessTimers();
      setCustomDocuments(processedDocuments);
      setSelectedDoc((current) => (
        processedDocuments.find((item) => item.doc.id === current.id)?.doc
        ?? processedDocuments[0]?.doc
        ?? current
      ));
      setCompletedModels((current) => ({ ...current, transliterationModel: modelName }));
      setScanProgress(100);
      setProcessStage('complete');
      setResultView('transliteration');

      processedDocuments.forEach((item, index) => {
        onScanCompleted({
          id: `scan-${item.ocrJob?.id ?? `${Date.now()}-${index}`}`,
          date: scanHistoryDate(),
          fileName: item.name,
          title: item.doc.title,
          rawBosančicaText: item.doc.rawBosančicaText,
          latinText: item.doc.latinText,
          accuracy: Number(item.ocrJob?.confidence ?? 0),
          durationMs: Number(item.ocrJob?.duration_ms ?? 0),
        });
      });
    } catch (error) {
      if (controller.signal.aborted) return;

      clearProcessTimers();
      setApiErrorMessage(TRANSLITERATION_FAILURE_MESSAGE);
      setScanProgress(0);
      setProcessStage('failed');
    } finally {
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
    }
  };

  const startSegmentation = () => {
    if (!['idle', 'failed', 'cancelled', 'segmented', 'complete'].includes(processStage)) return;
    onResearcherReviewedChange(false);

    if (storedSegmentJob) {
      void runStoredSegmentation(storedSegmentJob);
      return;
    }

    if (customDocuments.length) {
      void runUploadedSegmentation(customDocuments);
      return;
    }

    runProcess('segmenting', () => {
      setCompletedModels((current) => ({ ...current, segmentationModel: modelName }));
      setProcessStage('segmented');
      setResultView('segmentation');
    });
  };

  const runStoredSegmentation = async (segmentJob: SegmentJob) => {
    clearProcessTimers();
    cancelOcrRequest();

    const controller = new AbortController();
    ocrAbortRef.current = controller;
    activeRemoteJobRef.current = { type: 'segment', id: segmentJob.id };
    setApiErrorMessage(null);
    setProcessStage('segmenting');
    setResultView('segmentation');
    setScanProgress(8);
    setCompletedModels({ segmentationModel: '', transliterationModel: '' });

    let progress = 8;
    processIntervalRef.current = window.setInterval(() => {
      progress = Math.min(90, progress + 1);
      setScanProgress((current) => Math.max(current, progress));
    }, 500);

    try {
      const queuedJob = await retrySegmentJob(segmentJob.id, { modelId, modelName, signal: controller.signal });
      const completedJob = await waitForSegmentJob(queuedJob.id, controller.signal, (job) => {
        updateQueuedProgress(job.status, 0, 1);
        onSegmentHistoryChange?.();
      });

      if (completedJob.status !== 'segmented') throw new Error(SEGMENTATION_FAILURE_MESSAGE);

      const document = documentFromStoredSegmentJob(completedJob);
      setSelectedDoc(document);
      setStoredSegmentJob(completedJob);
      setCompletedModels({ segmentationModel: completedJob.model_name ?? modelName, transliterationModel: '' });
      setScanProgress(100);
      setProcessStage('segmented');
      onSegmentHistoryChange?.();
    } catch (error) {
      if (controller.signal.aborted) return;

      clearProcessTimers();
      setApiErrorMessage(SEGMENTATION_FAILURE_MESSAGE);
      setCompletedModels({ segmentationModel: '', transliterationModel: '' });
      setScanProgress(0);
      setProcessStage('failed');
    } finally {
      activeRemoteJobRef.current = null;
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
    }
  };

  const startTransliteration = () => {
    if (processStage !== 'segmented') return;

    if (customDocuments.length) {
      void runUploadedTransliteration(customDocuments);
      return;
    }

    if (storedSegmentJob) {
      void runStoredTransliteration(storedSegmentJob);
      return;
    }

    setApiErrorMessage('This document has no saved segmentation to send to OCR. Select or upload a segmented document, then try transliteration again.');
    setProcessStage('failed');
    setScanProgress(0);
  };

  const startNormalization = () => {
    if (processStage !== 'complete' || normalizationStatus === 'running') return;

    const text = editedLines.join(' ').trim();
    if (!text) {
      setApiErrorMessage('Nema transliteriranog teksta za normalizaciju.');
      return;
    }

    const controller = new AbortController();
    ocrAbortRef.current = controller;
    setApiErrorMessage(null);
    setNormalizationStatus('running');
    setProcessStage('normalizing');
    setScanProgress(20);

    const ocrJobId = activeCustomDocument?.ocrJob?.id ?? storedSegmentJob?.ocr_job?.id;
    void normalizeModernBosnian(text, ocrJobId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setNormalization(result);
        setNormalizationOnly(true);
        setNormalizationStatus('completed');
        setCompletedModels((current) => ({ ...current, normalizationModel: result.model }));
        setScanProgress(100);
        setProcessStage('complete');
        setResultView('transliteration');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNormalizationStatus('failed');
        setApiErrorMessage(error instanceof Error ? error.message : 'Normalizacija nije uspjela. Pokušajte ponovo.');
        setScanProgress(100);
        setProcessStage('complete');
      })
      .finally(() => {
        if (ocrAbortRef.current === controller) ocrAbortRef.current = null;
      });
  };

  const runStoredTransliteration = async (segmentJob: SegmentJob) => {
    clearProcessTimers();
    cancelOcrRequest();
    const controller = new AbortController();
    ocrAbortRef.current = controller;
    setApiErrorMessage(null);
    setProcessStage('transliterating');
    setResultView('transliteration');
    setScanProgress(8);

    try {
      const createdJob = await createOcrJob({
        segmentJobId: segmentJob.id,
        documentName: selectedDoc.title,
        modelId,
        modelName,
        signal: controller.signal,
      });
      activeRemoteJobRef.current = { type: 'ocr', id: createdJob.id };
      const completedJob = await waitForOcrJob(createdJob.id, controller.signal, (job) => {
        updateQueuedProgress(job.status, 0, 1);
      });
      const finalJob = terminalOcrFailureStatuses.has(completedJob.status)
        ? await waitForOcrJob((await retryOcrJob(completedJob.id, controller.signal)).id, controller.signal)
        : completedJob;
      if (terminalOcrFailureStatuses.has(finalJob.status) || finalJob.status === 'cancelled') {
        throw new Error(TRANSLITERATION_FAILURE_MESSAGE);
      }

      const document = documentFromOcrJob({ doc: documentFromStoredSegmentJob(segmentJob) }, finalJob);
      window.localStorage.removeItem(`${OCR_DRAFT_STORAGE_PREFIX}${document.id}`);
      setSelectedDoc(document);
      setStoredSegmentJob({ ...segmentJob, ocr_job: finalJob });
      setCompletedModels((current) => ({ ...current, transliterationModel: finalJob.model_name ?? modelName }));
      activeRemoteJobRef.current = null;
      setScanProgress(100);
      setProcessStage('complete');
      setResultView('transliteration');
      onSegmentHistoryChange?.();
    } catch (error) {
      if (!controller.signal.aborted) {
        setApiErrorMessage(TRANSLITERATION_FAILURE_MESSAGE);
        setScanProgress(0);
        setProcessStage('failed');
      }
    } finally {
      if (ocrAbortRef.current === controller) ocrAbortRef.current = null;
    }
  };

  const activeCustomDocument = customDocuments.find((item) => item.doc.id === selectedDoc.id);
  const activeSegmentJob = activeCustomDocument?.segmentJob
    ?? (storedSegmentJob && selectedDoc.id === `segment-job-${storedSegmentJob.id}` ? storedSegmentJob : null);
  const segmentationLines = activeSegmentJob && activeCustomDocument
    ? documentFromSegmentJob(activeCustomDocument, activeSegmentJob).lines
    : selectedDoc.lines;

  const confirmResearcherReview = async () => {
    if (processStage !== 'complete') return false;

    try {
      setApiErrorMessage(null);
      await createResearcherCorrection({
        ocr_job_id: activeCustomDocument?.ocrJob?.id ?? storedSegmentJob?.ocr_job?.id,
        segment_job_id: activeSegmentJob?.id,
        document_id: selectedDoc.id,
        document_name: selectedDoc.title,
        model_id: modelId,
        model_name: modelName,
        lines: selectedDoc.lines.map((line, lineIndex) => ({
          line_index: lineIndex,
          original_bosancica: line.textBosančica,
          corrected_bosancica: editedBosancicaLines[lineIndex] ?? line.textBosančica,
          original_latin: line.textLatinica,
          corrected_latin: editedLines[lineIndex] ?? line.textLatinica,
          line_image_url: line.lineImageUrl,
        })),
      });
      onResearcherReviewedChange(true);
      return true;
    } catch (error) {
      setApiErrorMessage(error instanceof Error ? error.message : 'Kontrolu nije moguće sačuvati.');
      onResearcherReviewedChange(false);
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    startSegmentation,
    startTransliteration,
    startNormalization,
    cancelProcess,
    showSegmentation: () => {
      if (canViewSegmentation) setResultView('segmentation');
    },
    showTransliteration: () => {
      if (canViewTransliteration) setResultView('transliteration');
    },
    confirmResearcherReview,
  }), [
    processStage,
    normalizationStatus,
    selectedDoc,
    editedLines,
    editedBosancicaLines,
    customDocuments,
    modelId,
    modelName,
    initialUploadBatchId,
    canViewSegmentation,
    canViewTransliteration,
  ]);

  const previewUsesContainedImage = selectedDoc.previewFit === 'contain';
  const isLineHighlighted = (index: number) => activeLine === index || selectedLine === index;
  const selectLine = (index: number) => {
    setSelectedLine(index);
    setActiveLine(index);
    window.requestAnimationFrame(() => document.getElementById(`ocr-line-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const resetPreviewTransform = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-preview-control]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressLineClickRef.current = false;
    panStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
    setIsPanning(true);
  };
  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) start.moved = true;
    setPan({ x: start.panX + deltaX, y: start.panY + deltaY });
  };
  const handlePreviewPointerEnd = () => {
    suppressLineClickRef.current = Boolean(panStartRef.current?.moved);
    panStartRef.current = null;
    setIsPanning(false);
  };
  const renderSegmentLineOverlays = () => selectedDoc.lines.map((ln, idx) => (
    <div
      key={idx}
      onMouseEnter={() => !isScanning && setActiveLine(idx)}
      onMouseLeave={() => !isScanning && setActiveLine(null)}
      onClick={() => {
        if (suppressLineClickRef.current) {
          suppressLineClickRef.current = false;
          return;
        }
        if (!isScanning) selectLine(idx);
      }}
      data-line-overlay
      style={{
        left: `${ln.left ?? 4}%`,
        top: `${ln.top}%`,
        width: `${ln.width ?? 92}%`,
        height: `${ln.height}%`,
      }}
      className={`absolute z-20 border rounded cursor-pointer transition-all duration-300 ${
        isLineHighlighted(idx)
          ? 'border-[#C5A059] bg-[#C5A059]/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.88),0_0_18px_rgba(197,160,89,0.35)]'
          : 'border-white/10 bg-black/10'
      }`}
    >
      {showLineLabels && (
        <div className="absolute -top-3 left-2 bg-[#0F0F0F] text-[8px] text-[#C5A059] px-1.5 py-0.5 border border-[#2A2A2A] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {t('RED')} #{idx + 1}
        </div>
      )}
    </div>
  ));
  const formatPercent = (value?: number) => (
    typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : 'n/a'
  );

  return (
    <div className={`scan-workflow ${focusDocumentView ? 'scan-workflow--focused' : ''}`}>
      <section className="document-meta-panel">
        <div className="document-meta-panel__main">
          <span>Aktivni dokument</span>
          <h2>{selectedDoc.title}</h2>
          <p className="document-location">
            <MapPin size={13} />
            <span>{editedLocation} · {selectedDoc.year}</span>
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
          <span>
            <CalendarClock size={14} />{' '}
            {t(documentProcessStatus)}
          </span>
          <span><FileText size={14} /> {t('Segmenti')}: {selectedDoc.lines.length}</span>
        </div>

      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 items-start gap-8">
      {/* LEFT COLUMN: Preset selector & upload & active file preview */}
      <div className="lg:col-span-5 lg:sticky lg:top-20 lg:h-[calc(100dvh-8.5rem)] self-start flex w-full flex-col gap-6">
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
                <span className="text-[9px] text-stone-500 uppercase tracking-widest font-mono">Učitani dokumenti</span>
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
        <div className="relative flex h-full flex-col p-6 pb-2 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] backdrop-blur-sm overflow-hidden select-none">
          <p className="text-xs font-serif text-[#C5A059] uppercase tracking-[0.2em] mb-3">
            Vizuelni segmenter ({modelName})
          </p>

          <div
            ref={previewViewportRef}
            className={`relative flex-1 touch-none bg-[#0A0A0A] rounded-xl overflow-hidden border border-[#2A2A2A] min-h-[300px] flex items-center justify-center group ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerEnd}
            onPointerCancel={handlePreviewPointerEnd}
          >
            <div data-preview-control className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-[#4a4439] bg-[#12110f]/90 p-1 shadow-lg">
              <Button type="button" className="grid h-7 w-7 place-items-center rounded text-stone-300 hover:bg-white/10" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.2).toFixed(2))))} aria-label={t('Umanji prikaz')}><ZoomOut size={14} /></Button>
              <span className="min-w-10 text-center text-[9px] text-stone-400">{Math.round(zoom * 100)}%</span>
              <Button type="button" className="grid h-7 w-7 place-items-center rounded text-stone-300 hover:bg-white/10" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.2).toFixed(2))))} aria-label={t('Uvećaj prikaz')}><ZoomIn size={14} /></Button>
              <Button type="button" className="grid h-7 w-7 place-items-center rounded text-stone-300 hover:bg-white/10" onClick={resetPreviewTransform} aria-label={t('Prilagodi prikaz')}><Maximize2 size={14} /></Button>
            </div>
            <Button
              type="button"
              data-preview-control
              aria-pressed={showLineLabels}
              aria-label={t(showLineLabels ? 'Sakrij oznake redova' : 'Prikaži oznake redova')}
              title={t(showLineLabels ? 'Sakrij oznake redova' : 'Prikaži oznake redova')}
              onClick={() => setShowLineLabels((visible) => !visible)}
              className={`absolute left-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-lg border bg-[#12110f]/90 shadow-lg transition ${showLineLabels ? 'border-[#c5a059] text-[#e0c182]' : 'border-[#4a4439] text-stone-400'}`}
            >
              <Tags size={15} />
            </Button>
            {previewUsesContainedImage ? (
              <div className="relative h-full w-full max-w-full max-h-full transition-transform duration-100" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <img
                  src={selectedDoc.imageUrl}
                  alt="Bosančica scan"
                  referrerPolicy="no-referrer"
                  className="block h-full w-full object-contain brightness-95 contrast-110"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    setPreviewImageSize(naturalWidth && naturalHeight ? { width: naturalWidth, height: naturalHeight } : null);
                  }}
                />
                <div
                  className="absolute"
                  style={containedImageBounds ?? { inset: 0 }}
                >
                  {renderSegmentLineOverlays()}
                </div>
              </div>
            ) : (
              <div className="relative h-full w-full transition-transform duration-100" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <div className="absolute inset-0 opacity-80 mix-blend-luminosity">
                  <img
                    src={selectedDoc.imageUrl}
                    alt="Bosančica scan"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover brightness-75 contrast-125"
                  />
                </div>
                {renderSegmentLineOverlays()}
              </div>
            )}

            <div className={`absolute inset-0 z-10 pointer-events-none ${
              previewUsesContainedImage
                ? 'bg-gradient-to-t from-black/45 via-transparent to-black/10'
                : 'bg-gradient-to-t from-black/90 via-transparent to-black/30'
            }`}></div>

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
            {!isScanning && !showResult && !showSegmentRows && (
              <div className="text-center p-6 z-10 max-w-xs">
                <Layers className="w-10 h-10 text-[#C5A059]/40 mx-auto mb-3" />
                <p className="text-xs text-stone-300 font-medium font-serif leading-relaxed">
                  {hasProcessFailed
                    ? (apiErrorMessage ?? 'Segmentacija nije uspjela.')
                    : processStage === 'segmented'
                    ? 'Segmentacija je završena. Pokrenite transliteraciju u zaglavlju.'
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
                {showSegmentRows ? 'Segmentirani redovi' : 'AI rezultat i transliteracija'}
              </h3>
              <p className="text-xs text-stone-405 mt-0.5">
                {showSegmentRows
                  ? `Kraken je izdvojio ${segmentationLines.length} redova iz slike.`
                  : `Rezultati izdvojeni modelom ${modelName}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canViewSegmentation && (
                <div className="full-text-tabs result-view-tabs" role="tablist" aria-label="Prikaz rezultata">
                  <Button
                    type="button"
                    role="tab"
                    aria-selected={resultView === 'segmentation' && !normalizationOnly}
                    onClick={() => {
                      setNormalizationOnly(false);
                      setResultView('segmentation');
                    }}
                    className={resultView === 'segmentation' && !normalizationOnly ? 'is-active' : undefined}
                  >
                    Segmentacija
                  </Button>
                  {canViewTransliteration && (
                    <Button
                      type="button"
                      role="tab"
                      aria-selected={resultView === 'transliteration' && !normalizationOnly}
                      onClick={() => {
                        setNormalizationOnly(false);
                        setResultView('transliteration');
                      }}
                      className={resultView === 'transliteration' && !normalizationOnly ? 'is-active' : undefined}
                    >
                      Transliteracija
                    </Button>
                  )}
                  {normalization && (
                    <Button type="button" role="tab" aria-selected={normalizationOnly} onClick={() => { setResultView('transliteration'); setNormalizationOnly(true); }} className={normalizationOnly ? 'is-active' : undefined}>
                      {t('Normalizacija')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {isScanning && (
            <div className="flex-grow flex flex-col items-center justify-center p-10 text-center animate-pulse">
              <RefreshCw className="w-8 h-8 text-[#C5A059] animate-spin mb-4" />
              <p className="text-sm text-stone-300 font-serif">
                {processStage === 'segmenting' ? 'Segmentiram redove dokumenta...' : processStage === 'normalizing' ? 'Pretvaram tekst u savremeni bosanski...' : 'Dešifrujem ligaturna spajanja...'}
              </p>
              <p className="text-xs text-stone-500 mt-1">Napredak obrade: {scanProgress}%</p>
              <Button
                type="button"
                className="scan-processing-stop"
                onClick={cancelProcess}
              >
                Zaustavi obradu
              </Button>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
          {showSegmentRows && !isScanning && (
            <motion.div
              key="segmentation"
              className="flex-grow flex flex-col gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <legend className="text-xs font-serif uppercase tracking-[0.2em] text-[#C5A059]">
                  Segmentacija po redovima
                </legend>
              </div>

              {activeSegmentJob?.ai_corrected_segments && (
                <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-400">
                  Prikazana je AI-korigovana segmentacija. Izvorni Kraken rezultat je sačuvan.
                </p>
              )}

              <div className="flex flex-col gap-3">
                {segmentationLines.map((line, idx) => (
                  <div
                    key={idx}
                    onMouseEnter={() => setActiveLine(idx)}
                    onMouseLeave={() => setActiveLine(null)}
                    onClick={() => selectLine(idx)}
                    className={`p-3.5 rounded-xl transition-all duration-200 border ${
                      isLineHighlighted(idx)
                        ? 'bg-[#1A1A1A] border-[#C5A059]/80 translate-x-1 shadow-md'
                        : 'bg-[#0A0A0A] border-[#2A2A2A]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] font-mono bg-[#1A1A1A] border border-[#2A2A2A] px-1.5 py-0.5 rounded text-[#C5A059] font-bold">
                        {t('RED')} {idx + 1}
                      </span>
                      <span className="text-[10px] text-stone-500 font-mono">
                        y {formatPercent(line.top)} · h {formatPercent(line.height)}
                      </span>
                      <div className="w-full border-t border-[#2A2A2A]/40"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5 bg-black/40 p-2.5 rounded-lg border border-[#2A2A2A]">
                        <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                          Kraken segment
                        </span>
                        {line.lineImageUrl && (
                          <img
                            src={line.lineImageUrl}
                            alt={`Segmentirani red ${idx + 1}`}
                            className="max-h-24 w-full rounded border border-[#2A2A2A] bg-[#F5E9BF] object-contain"
                          />
                        )}
                        <strong className="text-sm text-stone-200 font-serif">{line.textBosančica}</strong>
                      </div>
                      <div className="flex flex-col gap-1.5 bg-[#1A1A1A]/30 p-2.5 rounded-lg border border-[#2A2A2A]">
                        <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                          Koordinate
                        </span>
                        <p className="text-xs text-stone-300 font-mono">
                          x {formatPercent(line.left)} · w {formatPercent(line.width)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {!isScanning && !showResult && !showSegmentRows && (
            <div className="flex-grow flex flex-col items-center justify-center p-12 text-center text-stone-500">
              <FileText className="w-12 h-12 text-[#2A2A2A] mb-3" />
              <p className="text-sm font-serif">
                {hasProcessFailed ? 'Segmentacija nije uspjela.' : processStage === 'segmented' ? 'Segmentacija je spremna.' : 'Čekam segmentaciju dokumenta...'}
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
            <motion.div
              key="transliteration"
              className="flex-grow flex flex-col gap-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {apiErrorMessage && (
                <p className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                  {apiErrorMessage}
                </p>
              )}
              {!normalizationOnly && (<>
              {/* LINE BY LINE BREAKDOWN */}
              <div className="flex flex-col gap-4">
                <legend className="text-xs font-serif uppercase tracking-[0.2em] text-[#C5A059]">
                  Transliteracija po segmentima reda
                </legend>

                <div className="flex flex-col gap-3">
                  {selectedDoc.lines.map((line, idx) => (
                    <div
                      key={idx}
                      id={`ocr-line-${idx}`}
                      onMouseEnter={() => setActiveLine(idx)}
                      onMouseLeave={() => setActiveLine(null)}
                      onClick={() => selectLine(idx)}
                      className={`p-3.5 rounded-xl transition-all duration-200 border ${
                        isLineHighlighted(idx)
                          ? 'bg-[#1A1A1A] border-[#C5A059]/80 translate-x-1 shadow-md'
                          : 'bg-[#0A0A0A] border-[#2A2A2A]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono bg-[#1A1A1A] border border-[#2A2A2A] px-1.5 py-0.5 rounded text-[#C5A059] font-bold">
                          {t('RED')} {idx + 1}
                        </span>
                        <div className="w-full border-t border-[#2A2A2A]/40"></div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5 bg-black/40 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Digitalna Bosančica
                          </span>
                          <BosancicaHoverText
                            language={language}
                            value={editedBosancicaLines[idx] ?? line.textBosančica}
                            onChange={(value) => {
                              applyTranscriptionChange(
                                editedLines.map((item, lineIndex) => lineIndex === idx ? transliterateBosancicaToLatin(value) : item),
                                editedBosancicaLines.map((item, lineIndex) => lineIndex === idx ? value : item),
                              );
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5 bg-[#1A1A1A]/30 p-2.5 rounded-lg border border-[#2A2A2A]">
                          <span className="text-[8px] text-stone-500 font-serif uppercase tracking-widest">
                            Savremena Latinica
                          </span>
                          <EditableLatinText
                            value={editedLines[idx] ?? line.textLatinica}
                            onChange={(value) => {
                              applyTranscriptionChange(
                                editedLines.map((item, lineIndex) => lineIndex === idx ? value : item),
                                editedBosancicaLines.map((item, lineIndex) => lineIndex === idx ? toBosancicaFontInput(value.toLocaleLowerCase('bs')) : item),
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              </>)}
              {normalization && normalizationOnly && (
                <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-serif text-emerald-300">{t('Normalizacija — savremeni bosanski')}</span>
                      <span className="ml-2 text-[10px] text-stone-500">{normalization.document_type} · {normalization.model}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <PrimaryButton
                        onClick={() => void handleCopyNormalizationText()}
                        className="copy-text-button inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-400/70 bg-emerald-300 px-3 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-200"
                      >
                        {t('Kopiraj Tekst')}
                      </PrimaryButton>
                      <div className="relative shrink-0" ref={normalizationExportMenuRef}>
                        <Button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={normalizationExportMenuOpen}
                          onClick={() => setNormalizationExportMenuOpen((open) => !open)}
                          className="copy-text-button inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c5a059] bg-transparent px-3 text-xs font-semibold text-[#e0c182] transition hover:bg-[#302716]"
                        >
                          <Download size={14} aria-hidden="true" />
                          {t('Izvoz')}
                          <ChevronDown size={14} aria-hidden="true" />
                        </Button>
                        <AnimatePresence>
                          {normalizationExportMenuOpen && (
                            <motion.div
                              role="menu"
                              aria-label={t('Opcije izvoza normalizacije')}
                              className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-emerald-800 bg-[#102019] p-3 shadow-2xl"
                              initial={{ opacity: 0, y: -6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.98 }}
                              transition={{ duration: 0.16 }}
                            >
                              <p className="mb-2 text-[10px] font-serif uppercase tracking-[0.14em] text-emerald-300">
                                {t('Odaberite format')}
                              </p>
                              <div className="flex gap-1.5">
                                {(['txt', 'doc', 'pdf'] as const).map((format) => (
                                  <Button key={format} type="button" role="menuitem" onClick={() => handleNormalizationExport(format)} className="rounded border border-emerald-800 px-2 py-1 text-[10px] uppercase text-emerald-100 hover:border-emerald-400 hover:text-emerald-200">
                                    {format}
                                  </Button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm leading-relaxed text-stone-100">
                    {(normalization.paragraphs?.length ? normalization.paragraphs : normalization.modern_bosnian.split(/\n{2,}/)).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  </div>
                  {normalization.summary && <p className="mt-3 text-xs text-stone-400"><span className="text-stone-300">Sažetak:</span> {normalization.summary}</p>}
                  {normalization.uncertainties.length > 0 && <p className="mt-2 text-xs text-amber-300">Nesigurnosti: {normalization.uncertainties.join('; ')}</p>}
                </div>
              )}
              {!normalizationOnly && (<>
              {/* INTEGRATED FULL TEXT EXPORT */}
              <div className="mt-4 p-4 rounded-xl bg-black/45 border border-[#2A2A2A]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-sm text-stone-400 font-serif">{t('Kompletan tekst')}</span>
                    <span className="ml-2 text-[9px] text-stone-500">
                      {draftStatus === 'saving' ? t('Spremanje nacrta…') : draftStatus === 'restored' ? t('Nacrt je vraćen') : t('Nacrt je sačuvan')}
                    </span>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center justify-end gap-2 max-[900px]:w-full max-[900px]:justify-start">
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[#c5a059] bg-transparent text-stone-300 hover:bg-[#302716] disabled:opacity-40" onClick={undoTranscriptionChange} disabled={undoHistoryRef.current.length === 0} aria-label={t('Poništi izmjenu')} title={t('Poništi izmjenu')}><Undo2 size={15} /></Button>
                      <Button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[#c5a059] bg-transparent text-stone-300 hover:bg-[#302716] disabled:opacity-40" onClick={redoTranscriptionChange} disabled={redoHistoryRef.current.length === 0} aria-label={t('Ponovi izmjenu')} title={t('Ponovi izmjenu')}><Redo2 size={15} /></Button>
                      <span className="sr-only">{historyVersion}</span>
                    </div>
                    <div className="full-text-tabs shrink-0" role="tablist" aria-label="Pismo kompletnog teksta">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={fullTextScript === 'latinica'}
                        className={fullTextScript === 'latinica' ? 'is-active' : undefined}
                        onClick={() => setFullTextScript('latinica')}
                      >
                        {t('Latinica')}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={fullTextScript === 'bosancica'}
                        className={fullTextScript === 'bosancica' ? 'is-active' : undefined}
                        onClick={() => setFullTextScript('bosancica')}
                      >
                        {t('Bosančica')}
                      </button>
                    </div>
                    <PrimaryButton
                      onClick={() => void handleCopyText()}
                      className="copy-text-button inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#c5a059] bg-[#c5a059] px-3 text-xs font-semibold text-[#201a0d] transition hover:bg-[#d4b069]"
                    >
                      {t('Kopiraj Tekst')}
                    </PrimaryButton>
                    <div className="relative shrink-0" ref={exportMenuRef}>
                      <Button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={exportMenuOpen}
                        onClick={toggleExportMenu}
                        className="copy-text-button inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c5a059] bg-transparent px-3 text-xs font-semibold text-[#e0c182] transition hover:bg-[#302716]"
                      >
                        <Download size={14} aria-hidden="true" />
                        {t('Izvoz')}
                        <ChevronDown size={14} aria-hidden="true" />
                      </Button>
                      <AnimatePresence>
                        {exportMenuOpen && (
                        <motion.div
                          role="menu"
                          aria-label="Opcije izvoza OCR rezultata"
                          className={`absolute right-0 z-30 w-72 rounded-xl border border-[#4a4030] bg-[#171512] p-3 shadow-2xl ${exportMenuOpenUpward ? 'bottom-full mb-2' : 'mt-2'}`}
                          initial={{ opacity: 0, y: exportMenuOpenUpward ? 6 : -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: exportMenuOpenUpward ? 6 : -6, scale: 0.98 }}
                          transition={{ duration: 0.16 }}
                        >
                          <p className="mb-2 text-[10px] font-serif uppercase tracking-[0.14em] text-[#c5a059]">
                            {t('Odaberite pismo i format')}
                          </p>
                          <div className="flex flex-col gap-2">
                            {([
                              ['bosancica', t('Bosančica')],
                              ['latinica', t('Latinica')],
                              ['both', t('Bosančica i latinica')],
                            ] as const).map(([script, label]) => (
                              <div key={script} className="rounded-lg border border-[#302c26] bg-black/20 px-2.5 py-2">
                                <span className="mb-1.5 block text-xs text-stone-200">{label}</span>
                                <div className="flex gap-1.5">
                                  <Button type="button" role="menuitem" onClick={() => handleExport('txt', script)} className="rounded border border-[#4a4439] px-2 py-1 text-[10px] text-stone-300 hover:border-[#c5a059] hover:text-[#e0c182]">TXT</Button>
                                  <Button type="button" role="menuitem" onClick={() => handleExport('doc', script)} className="rounded border border-[#4a4439] px-2 py-1 text-[10px] text-stone-300 hover:border-[#c5a059] hover:text-[#e0c182]">DOC</Button>
                                  <Button type="button" role="menuitem" onClick={() => handleExport('pdf', script)} className="rounded border border-[#4a4439] px-2 py-1 text-[10px] text-stone-300 hover:border-[#c5a059] hover:text-[#e0c182]">PDF</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                <p className={`text-xs text-[#E0E0E0] leading-relaxed italic ${fullTextScript === 'bosancica' ? 'font-bosanko full-text-bosancica' : ''}`}>
                  "{fullTextScript === 'bosancica' ? editedBosancicaLines.join(' ') : editedLines.join(' ')}"
                </p>
              </div>
              </>)}
            </motion.div>
          )}
          </AnimatePresence>
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
              <Button type="submit">Sačuvaj lokaciju</Button>
            </div>
          </form>
        </div>
      )}
      {copyToastVisible && (
        <div
          role="status"
          aria-live="polite"
          className="copy-toast fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-400/40 bg-[#1a211b] px-4 py-3 text-sm text-emerald-100 shadow-xl"
        >
          <CheckCircle2 size={18} className="text-emerald-400" aria-hidden="true" />
          <span>{t('Tekst je kopiran u međumemoriju.')}</span>
        </div>
      )}
    </div>
  );
});

export default ScanWorkflow;
