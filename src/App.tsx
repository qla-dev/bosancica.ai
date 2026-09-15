import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  Archive,
  BookOpen,
  Bot,
  ChevronUp,
  Check,
  ChevronDown,
  Download,
  EllipsisVertical,
  FileText,
  History,
  Image as ImageIcon,
  Images,
  MessageSquareText,
  Languages,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { MOCK_HISTORY } from './data';
import { ScanItem } from './types';
import ScanWorkflow, { type ScanProcessStatus, type ScanWorkflowHandle } from './components/ScanWorkflow';
import LetterArchive from './components/LetterArchive';
import LetterTrainerWorkspace from './components/LetterTrainerWorkspace';
import SettingsWorkspace from './components/SettingsWorkspace';
import BookWorkspace from './components/BookWorkspace';
import { translateUiText, type AppLanguage, type AppTheme, useUiLocalization } from './i18n';
import { deleteSegmentJob, getSegmentJobDocumentUrl, listBookDocuments, listOcrModels, listSegmentJobs, type BookDocument, type OcrModelOption, type SegmentJob } from './api/ocrJobs';
import Button from './components/ui/Button';
import IconButton from './components/ui/IconButton';
import PrimaryButton from './components/ui/PrimaryButton';
import useGpuInfo from './hooks/useGpuInfo';

type Workspace = 'home' | 'scanner' | 'archive' | 'letters' | 'book' | 'trainer';
type RecentDocument = {
  id: string;
  title: string;
  uploadBatchId?: string;
  presetId?: string;
  files?: File[];
  segmentJob?: SegmentJob;
};

const workspaceMeta: Record<Workspace, { label: string; eyebrow: string }> = {
  home: { label: 'Novi dokument', eyebrow: 'Bosančica AI' },
  scanner: { label: 'Skeniranje i transliteracija', eyebrow: 'OCR laboratorija' },
  archive: { label: 'AI trener', eyebrow: 'Digitalna zbirka' },
  letters: { label: 'Arhiva slova', eyebrow: 'Digitalna zbirka' },
  book: { label: 'Digitalna knjiga', eyebrow: 'Digitalna zbirka' },
  trainer: { label: 'Postavke', eyebrow: 'Konfiguracija modela' },
};

const DEFAULT_MODEL_OPTIONS: OcrModelOption[] = [
  {
    id: 'kraken-bvision-local',
    label: 'Kraken BVision OCR',
    description: 'qla.dev local server',
    badge: 'AKTIVNO',
  },
  {
    id: 'kraken-2-local',
    label: 'Kraken SHARP-256 OCR',
    description: 'qla.dev local server',
    badge: 'AKTIVNO',
  },
];

const orderModelOptions = (models: OcrModelOption[]) => [...models].sort((left, right) => {
  const leftRecommended = left.badge === 'PREPORUČENO';
  const rightRecommended = right.badge === 'PREPORUČENO';

  if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
  return left.label.localeCompare(right.label);
});

const localizeModelBadge = (badge: string, language: AppLanguage) => (
  language === 'en' && badge === 'PREPORUČENO' ? 'RECOMMENDED' : badge
);

const shouldShowModelBadge = (badge?: string) => badge && badge !== 'AKTIVNO';

const HOME_GREETINGS = [
  'Zdravo, istraživaču. Koji dokument čitamo?',
  'Koji trag prošlosti danas čitamo?',
  'Spremni za novu transliteraciju?',
  'Spustite dokument. Otkrijmo šta piše.',
  'Koju stranicu historije danas otvaramo?',
  'Novi dokument, nova priča. Počnimo.',
  'Šta nam prošlost danas želi reći?',
  'Odaberite dokument i krenimo.',
  'Koji rukopis danas oživljavamo?',
  'Vrijeme je za još jedno otkriće.',
  'Spustite trag. Pročitajmo znakove.',
  'Koju povelju danas vraćamo u život?',
];

const LOGIN_CREDENTIALS = {
  username: 'qla.dev',
  password: 'Qla.dev2026!',
};

const AUTH_SESSION_STORAGE_KEY = 'bosancica.auth-session';
const AUTH_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const HIDDEN_SEGMENT_HISTORY_STORAGE_KEY = 'bosancica.hidden-segment-history';
const RECENT_HISTORY_WINDOW_STORAGE_KEY = 'bosancica.recent-history-window';
const APP_PREFERENCES_STORAGE_KEY = 'bosancica.app-preferences';

type RecentHistoryWindow = { ids: number[]; highWatermark: number };

type AppPreferences = {
  language: AppLanguage;
  theme: AppTheme;
  disabledModelIds: string[];
};

const readAppPreferences = (): AppPreferences => {
  if (typeof window === 'undefined') return { language: 'bs', theme: 'dark', disabledModelIds: [] };
  try {
    const saved = JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? '{}') as {
      language?: AppLanguage;
      theme?: AppTheme;
      disabledModelIds?: unknown;
    };
    return {
      language: saved.language === 'en' ? 'en' : 'bs',
      theme: saved.theme === 'light' ? 'light' : 'dark',
      disabledModelIds: Array.isArray(saved.disabledModelIds)
        ? saved.disabledModelIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return { language: 'bs', theme: 'dark', disabledModelIds: [] };
  }
};

const readAuthSessionExpiration = () => {
  if (typeof window === 'undefined') return null;

  try {
    const storedSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!storedSession) return null;

    const session = JSON.parse(storedSession) as { expiresAt?: unknown };
    if (
      typeof session.expiresAt !== 'number'
      || !Number.isFinite(session.expiresAt)
      || session.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    return session.expiresAt;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
};

const readHiddenSegmentHistory = () => {
  if (typeof window === 'undefined') return [] as number[];

  try {
    const storedIds = JSON.parse(window.localStorage.getItem(HIDDEN_SEGMENT_HISTORY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(storedIds)) return [];

    return storedIds.filter((id): id is number => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
};

const readRecentHistoryWindow = (): RecentHistoryWindow | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_HISTORY_WINDOW_STORAGE_KEY) ?? 'null') as Partial<RecentHistoryWindow> | null;
    if (!value || !Array.isArray(value.ids) || !Number.isInteger(value.highWatermark)) return null;
    return {
      ids: value.ids.filter((id): id is number => Number.isInteger(id) && id > 0),
      highWatermark: Math.max(0, value.highWatermark ?? 0),
    };
  } catch {
    return null;
  }
};

const recentDocumentFromSegmentJob = (job: SegmentJob): RecentDocument => ({
  id: `segment-${job.id}`,
  title: job.document_name || job.original_filename || `Dokument #${job.id}`,
  segmentJob: job,
});

const processStatusFromSegmentJob = (job: SegmentJob): ScanProcessStatus => {
  if (job.ocr_job?.status === 'completed') {
    return {
      stage: 'complete',
      progress: 100,
      segmentationModel: job.model_name ?? undefined,
      transliterationModel: job.ocr_job.model_name ?? undefined,
    };
  }

  if (job.status === 'segmented') {
    return {
      stage: 'segmented',
      progress: 100,
      segmentationModel: job.model_name ?? undefined,
    };
  }

  if (job.status === 'failed') {
    return {
      stage: 'failed',
      progress: 0,
      segmentationModel: job.model_name ?? undefined,
    };
  }

  if (job.status === 'cancelled' || job.ocr_job?.status === 'cancelled') {
    return {
      stage: 'cancelled',
      progress: 0,
      segmentationModel: job.model_name ?? undefined,
      transliterationModel: job.ocr_job?.model_name ?? undefined,
    };
  }

  if (job.status === 'pending' || job.status === 'running') {
    return {
      stage: 'segmenting',
      progress: job.status === 'running' ? 60 : 25,
      segmentationModel: job.model_name ?? undefined,
    };
  }

  return { stage: 'idle', progress: 0, segmentationModel: job.model_name ?? undefined };
};

const isRecentDocumentProcessing = (document: RecentDocument) => (
  document.segmentJob?.status === 'pending'
  || document.segmentJob?.status === 'running'
  || document.segmentJob?.ocr_job?.status === 'pending'
  || document.segmentJob?.ocr_job?.status === 'running'
);

export default function App() {
  const [appPreferences, setAppPreferences] = useState(readAppPreferences);
  useUiLocalization(appPreferences.language);
  const t = (value: string) => translateUiText(value, appPreferences.language);
  const [authSessionExpiresAt, setAuthSessionExpiresAt] = useState<number | null>(readAuthSessionExpiration);
  const isAuthenticated = authSessionExpiresAt !== null;
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [greetingIndex, setGreetingIndex] = useState(() => Math.floor(Math.random() * HOME_GREETINGS.length));
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [modelOptions, setModelOptions] = useState<OcrModelOption[]>(DEFAULT_MODEL_OPTIONS);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_OPTIONS[0].id);
  const gpuInfo = useGpuInfo(selectedModel);
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [pendingUploadBatchId, setPendingUploadBatchId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [documentSelectionNonce, setDocumentSelectionNonce] = useState(0);
  const [documentFocusMode, setDocumentFocusMode] = useState(false);
  const [researcherReviewed, setResearcherReviewed] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(true);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [scanProcessStatus, setScanProcessStatus] = useState<ScanProcessStatus>({ stage: 'idle', progress: 0 });
  const [segmentProgressByJobId, setSegmentProgressByJobId] = useState<Record<number, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [transcriptionControlsCollapsed, setTranscriptionControlsCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [scansHistory, setScansHistory] = useState<ScanItem[]>(MOCK_HISTORY);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [bookDocuments, setBookDocuments] = useState<BookDocument[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [hiddenSegmentJobIds, setHiddenSegmentJobIds] = useState<number[]>(readHiddenSegmentHistory);
  const [historyMenuDocumentId, setHistoryMenuDocumentId] = useState<string | null>(null);
  const [historyMenuPosition, setHistoryMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [selectedSegmentJob, setSelectedSegmentJob] = useState<SegmentJob | null>(null);
  const recentDocumentsHaveProcessingJobs = recentDocuments.some(isRecentDocumentProcessing);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const multiImageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const mainShellRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const scanWorkflowRef = useRef<ScanWorkflowHandle>(null);
  const hiddenSegmentJobIdsRef = useRef(new Set(hiddenSegmentJobIds));
  const recentHistoryWindowRef = useRef<RecentHistoryWindow | null>(readRecentHistoryWindow());
  const segmentHistoryRefreshInFlightRef = useRef<Promise<void> | null>(null);

  const handleProcessStatusChange = useCallback((status: ScanProcessStatus) => {
    setScanProcessStatus(status);
    if (status.jobId && ['segmenting', 'transliterating', 'normalizing'].includes(status.stage)) {
      setSegmentProgressByJobId((current) => ({
        ...current,
        [status.jobId as number]: Math.max(current[status.jobId as number] ?? 0, status.progress),
      }));
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appPreferences.theme;
    document.documentElement.lang = appPreferences.language;
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(appPreferences));
  }, [appPreferences]);

  useEffect(() => {
    const updateScrollControls = () => {
      const scrollTop = window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;

      setCanScrollUp(scrollTop > 160);
      setCanScrollDown(scrollTop + viewportHeight < documentHeight - 8);
    };

    updateScrollControls();
    window.addEventListener('scroll', updateScrollControls, { passive: true });
    window.addEventListener('resize', updateScrollControls);
    return () => {
      window.removeEventListener('scroll', updateScrollControls);
      window.removeEventListener('resize', updateScrollControls);
    };
  }, [workspace, documentSelectionNonce]);

  const visibleModelOptions = modelOptions.filter(
    (option) => !appPreferences.disabledModelIds.includes(option.id),
  );

  useEffect(() => {
    setSelectedModel((currentModel) => (
      visibleModelOptions.some((option) => option.id === currentModel)
        ? currentModel
        : visibleModelOptions[0]?.id ?? ''
    ));
  }, [visibleModelOptions]);

  useEffect(() => {
    const controller = new AbortController();

    const refreshModelOptions = () => {
      void listOcrModels(controller.signal)
        .then((availableModels) => {
          const merged = new Map(DEFAULT_MODEL_OPTIONS.map((model) => [model.id, model]));
          availableModels.forEach((model) => merged.set(model.id, model));
          const nextModels = orderModelOptions(Array.from(merged.values()));

          setModelOptions(nextModels);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          console.warn('Could not load OCR model catalog; using known models.', error);
        });
    };

    refreshModelOptions();
    const catalogRefreshTimer = window.setInterval(refreshModelOptions, 30_000);

    return () => {
      controller.abort();
      window.clearInterval(catalogRefreshTimer);
    };
  }, []);

  useEffect(() => {
    if (authSessionExpiresAt === null) return;

    const remainingDuration = authSessionExpiresAt - Date.now();
    if (remainingDuration <= 0) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      setAuthSessionExpiresAt(null);
      return;
    }

    const expirationTimer = window.setTimeout(() => {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      setAuthSessionExpiresAt(null);
    }, remainingDuration);

    return () => window.clearTimeout(expirationTimer);
  }, [authSessionExpiresAt]);

  const refreshSegmentHistory = useCallback((signal?: AbortSignal) => {
    if (segmentHistoryRefreshInFlightRef.current) {
      return segmentHistoryRefreshInFlightRef.current;
    }

    const refreshRequest = (async () => {
      try {
        const jobs = await listSegmentJobs(signal);
        const hiddenIds = hiddenSegmentJobIdsRef.current;
        const availableJobs = jobs.filter((job) => !hiddenIds.has(job.id));
        const storedWindow = recentHistoryWindowRef.current;
        const nextWindow = storedWindow === null
          ? {
              ids: availableJobs.slice(0, 20).map((job) => job.id),
              highWatermark: Math.max(0, ...jobs.map((job) => job.id)),
            }
          : (() => {
              const availableIds = new Set(availableJobs.map((job) => job.id));
              const newlyCreatedIds = availableJobs
                .filter((job) => job.id > storedWindow.highWatermark)
                .map((job) => job.id);
              return {
                ids: Array.from(new Set([
                  ...newlyCreatedIds,
                  ...storedWindow.ids.filter((id) => availableIds.has(id)),
                ])).slice(0, 20),
                highWatermark: Math.max(storedWindow.highWatermark, 0, ...jobs.map((job) => job.id)),
              };
            })();
        recentHistoryWindowRef.current = nextWindow;
        window.localStorage.setItem(RECENT_HISTORY_WINDOW_STORAGE_KEY, JSON.stringify(nextWindow));
        const visibleWindowIds = new Set(nextWindow.ids);
        const persistedDocuments = availableJobs
          .filter((job) => visibleWindowIds.has(job.id))
          .map(recentDocumentFromSegmentJob);

        setRecentDocuments((current) => {
          const persistedTitles = new Set(persistedDocuments.map((document) => document.title));
          const activeUploads = current.filter((document) => (
            document.files?.length
            && !document.segmentJob
            && !persistedTitles.has(document.title)
          ));
          return [...activeUploads, ...persistedDocuments].slice(0, 20);
        });
        setSelectedSegmentJob((current) => current
          ? jobs.find((job) => job.id === current.id) ?? current
          : null);
      } catch {
        // The scanner still works if history cannot be refreshed.
      }
    })();

    segmentHistoryRefreshInFlightRef.current = refreshRequest;
    void refreshRequest.finally(() => {
      if (segmentHistoryRefreshInFlightRef.current === refreshRequest) {
        segmentHistoryRefreshInFlightRef.current = null;
      }
    });

    return refreshRequest;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Do not abort this first request during React's development remount cycle:
    // the next mount would otherwise reuse the aborted in-flight promise and
    // leave the sidebar empty until the interval fires.
    void refreshSegmentHistory();
    const historyRefreshTimer = window.setInterval(() => {
      void refreshSegmentHistory();
    }, recentDocumentsHaveProcessingJobs ? 1_500 : 15_000);

    return () => {
      window.clearInterval(historyRefreshTimer);
    };
  }, [isAuthenticated, recentDocumentsHaveProcessingJobs, refreshSegmentHistory]);

  // Queue work is independent of the currently open document. Keep an
  // estimated, monotonic progress value for every active history entry so
  // switching documents never freezes its indicator or resets it on return.
  useEffect(() => {
    const activeJobs = recentDocuments
      .map((document) => document.segmentJob)
      .filter((job): job is SegmentJob => Boolean(job) && (
        job.status === 'pending'
        || job.status === 'running'
        || job.ocr_job?.status === 'pending'
        || job.ocr_job?.status === 'running'
      ));

    if (!activeJobs.length) return;

    setSegmentProgressByJobId((current) => {
      const next = { ...current };
      activeJobs.forEach((job) => {
        const floor = job.ocr_job?.status === 'pending' || job.ocr_job?.status === 'running'
          ? 55
          : job.status === 'running' ? 12 : 8;
        next[job.id] = Math.max(next[job.id] ?? 0, floor);
      });
      return next;
    });

    const progressTimer = window.setInterval(() => {
      setSegmentProgressByJobId((current) => {
        const next = { ...current };
        activeJobs.forEach((job) => {
          const currentValue = next[job.id] ?? 0;
          next[job.id] = Math.min(90, Math.max(currentValue, 8) + 1);
        });
        return next;
      });
    }, 1_000);

    return () => window.clearInterval(progressTimer);
  }, [recentDocuments]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modeMenuRef.current?.contains(target)) setModeMenuOpen(false);
      if (!uploadMenuRef.current?.contains(target)) setUploadMenuOpen(false);
      if (!profileMenuRef.current?.contains(target)) setProfileMenuOpen(false);
      if (!(target instanceof Element) || !target.closest('.sidebar-history-menu, .sidebar-history-more')) {
        setHistoryMenuDocumentId(null);
      }
    };
    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  useEffect(() => {
    const closeHistoryMenu = () => setHistoryMenuDocumentId(null);
    document.addEventListener('scroll', closeHistoryMenu, true);
    window.addEventListener('resize', closeHistoryMenu);
    return () => {
      document.removeEventListener('scroll', closeHistoryMenu, true);
      window.removeEventListener('resize', closeHistoryMenu);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    mainShellRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [workspace, documentSelectionNonce]);

  const navigate = (next: Workspace) => {
    setWorkspace(next);
    setMobileSidebarOpen(false);
    setModeMenuOpen(false);
  };

  useEffect(() => {
    if (workspace !== 'book') return;
    const controller = new AbortController();
    setBookLoading(true);
    void listBookDocuments(controller.signal)
      .then((documents) => setBookDocuments(documents.filter((document) => document.ocr_job?.normalization != null)))
      .finally(() => setBookLoading(false));
    return () => controller.abort();
  }, [workspace]);

  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((value) => !value);
    } else {
      setMobileSidebarOpen((value) => !value);
    }
  };

  const startNewConversation = () => {
    setPendingUploads([]);
    setPendingUploadBatchId(null);
    setDocumentName('');
    setSelectedPresetId(null);
    setSelectedSegmentJob(null);
    setDocumentFocusMode(false);
    setResearcherReviewed(false);
    setReviewAvailable(true);
    setScanProcessStatus({ stage: 'idle', progress: 0 });
    setGreetingIndex((current) => (current + 1) % HOME_GREETINGS.length);
    navigate('home');
  };

  const clearChatHistory = () => {
    if (!recentDocuments.length) return;

    const confirmed = window.confirm(
      'Ukloniti svu historiju iz bočne trake? Dokumenti i rezultati obrade neće biti izbrisani.',
    );
    if (!confirmed) return;

    const nextHiddenIds = Array.from(new Set([
      ...hiddenSegmentJobIds,
      ...recentDocuments.flatMap((document) => document.segmentJob ? [document.segmentJob.id] : []),
    ]));

    hiddenSegmentJobIdsRef.current = new Set(nextHiddenIds);
    window.localStorage.setItem(HIDDEN_SEGMENT_HISTORY_STORAGE_KEY, JSON.stringify(nextHiddenIds));
    setHiddenSegmentJobIds(nextHiddenIds);
    setRecentDocuments([]);
    setDocumentSelectionNonce((value) => value + 1);
    startNewConversation();
  };

  const removeHistoryDocument = async (document: RecentDocument) => {
    if (document.segmentJob) {
      await deleteSegmentJob(document.segmentJob.id);
      const currentWindow = recentHistoryWindowRef.current;
      if (currentWindow) {
        const nextWindow = {
          ...currentWindow,
          ids: currentWindow.ids.filter((id) => id !== document.segmentJob?.id),
        };
        recentHistoryWindowRef.current = nextWindow;
        window.localStorage.setItem(RECENT_HISTORY_WINDOW_STORAGE_KEY, JSON.stringify(nextWindow));
      }
    }

    setHistoryMenuDocumentId(null);
    setRecentDocuments((current) => current.filter((item) => item.id !== document.id));

    if (selectedSegmentJob?.id === document.segmentJob?.id || document.uploadBatchId === pendingUploadBatchId) {
      startNewConversation();
    }
  };

  const downloadHistoryDocument = async (document: RecentDocument) => {
    setHistoryMenuDocumentId(null);

    if (document.segmentJob) {
      const response = await fetch(getSegmentJobDocumentUrl(document.segmentJob.id), { cache: 'no-store' });
      if (!response.ok) return;

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const filename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ?? document.title;
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }

    const file = document.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openUploadedDocuments = (files: File[]) => {
    const supportedFiles = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (!supportedFiles.length) return;
    const fallbackTitle = supportedFiles.length === 1
      ? supportedFiles[0].name
      : `${supportedFiles[0].name} + ${supportedFiles.length - 1}`;
    const title = documentName.trim() || fallbackTitle;
    const uploadBatchId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: RecentDocument = { id: uploadBatchId, uploadBatchId, title, files: supportedFiles };
    setPendingUploads(supportedFiles);
    setPendingUploadBatchId(uploadBatchId);
    setDocumentName(title);
    setSelectedPresetId(null);
    setSelectedSegmentJob(null);
    setDocumentFocusMode(false);
    setResearcherReviewed(false);
    setReviewAvailable(false);
    setScanProcessStatus({ stage: 'idle', progress: 0 });
    setDocumentSelectionNonce((value) => value + 1);
    setRecentDocuments((current) => [item, ...current].slice(0, 7));
    navigate('scanner');
  };

  useEffect(() => {
    if (!isAuthenticated || workspace !== 'home') {
      dragDepthRef.current = 0;
      setIsDragging(false);
      return;
    }

    const containsFiles = (event: globalThis.DragEvent) => (
      Array.from(event.dataTransfer?.types ?? []).includes('Files')
    );

    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    };

    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsDragging(false);
    };

    const handleWindowDrop = (event: globalThis.DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      resetDragState();
      openUploadedDocuments(files);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('dragend', resetDragState);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragend', resetDragState);
    };
  }, [documentName, isAuthenticated, workspace]);

  const openRecentDocument = (document: RecentDocument) => {
    const nextModelId = document.segmentJob?.model_id;
    if (nextModelId && visibleModelOptions.some((option) => option.id === nextModelId)) {
      setSelectedModel(nextModelId);
    }

    setDocumentName(document.title);
    setPendingUploads([...(document.files ?? [])]);
    setPendingUploadBatchId(document.uploadBatchId ?? (document.files?.length ? document.id : null));
    setSelectedPresetId(document.presetId ?? null);
    setSelectedSegmentJob(document.segmentJob ?? null);
    setDocumentFocusMode(true);
    setResearcherReviewed(false);
    setReviewAvailable(!document.files?.length && !document.segmentJob);
    setScanProcessStatus(document.segmentJob
      ? processStatusFromSegmentJob(document.segmentJob)
      : document.files?.length
        ? { stage: 'idle', progress: 0 }
        : { stage: 'complete', progress: 100 });
    setDocumentSelectionNonce((value) => value + 1);
    navigate('scanner');
    if (document.segmentJob) void refreshSegmentHistory();
  };

  // A saved preference can hide every model (including after the local catalog
  // changes). Keep a display fallback so the shell never crashes before the
  // user can re-enable a model in Settings.
  const activeModel = visibleModelOptions.find((option) => option.id === selectedModel)
    ?? visibleModelOptions[0]
    ?? modelOptions[0]
    ?? DEFAULT_MODEL_OPTIONS[0];
  const segmentationComplete = ['segmented', 'transliterating', 'complete'].includes(scanProcessStatus.stage);
  const transliterationComplete = scanProcessStatus.stage === 'complete' || scanProcessStatus.stage === 'normalizing';
  const normalizationComplete = scanProcessStatus.normalizationStatus === 'completed';
  const segmentationFailed = scanProcessStatus.stage === 'failed';
  const activeUploadIsProcessing = ['segmenting', 'transliterating', 'normalizing'].includes(scanProcessStatus.stage);

  const isRecentDocumentActiveUpload = (document: RecentDocument) => {
    const files = document.files;

    if (!files?.length) return false;

    return files.length === pendingUploads.length
      && files.every((file, index) => file === pendingUploads[index]);
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      loginUsername.trim() === LOGIN_CREDENTIALS.username
      && loginPassword === LOGIN_CREDENTIALS.password
    ) {
      const expiresAt = Date.now() + AUTH_SESSION_DURATION_MS;
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ expiresAt }));
      setAuthSessionExpiresAt(expiresAt);
      setLoginError('');
      setLoginPassword('');
      return;
    }

    setLoginError('Pogrešno korisničko ime ili lozinka.');
  };

  return (
    <div className={`app-shell ${workspace === 'home' ? 'app-shell--home' : ''}`}>
      <AnimatePresence>
        {!isAuthenticated && (
          <motion.div
            className="login-gate"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.form
              className="login-card"
              onSubmit={handleLoginSubmit}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              <span className="login-card__seal">Б</span>
              <h1 id="login-title">Prijava u Bosančica AI</h1>
              <p>
                Pristup je otvoren za qla.dev istraživački prostor. Unesite dodijeljene podatke za
                obradu i pregled dokumenata.
              </p>

              <div className="login-card__fields">
                <label>
                  <span>Korisničko ime</span>
                  <input
                    value={loginUsername}
                    onChange={(event) => {
                      setLoginUsername(event.target.value);
                      setLoginError('');
                    }}
                    autoComplete="username"
                    placeholder="Unesite korisničko ime"
                    aria-label="Korisničko ime"
                  />
                </label>
                <label>
                  <span>Lozinka</span>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => {
                      setLoginPassword(event.target.value);
                      setLoginError('');
                    }}
                    autoComplete="current-password"
                    placeholder="Unesite lozinku"
                    aria-label="Lozinka"
                  />
                </label>
              </div>

              {loginError && <span className="login-card__error">{loginError}</span>}

              <Button type="submit" className="login-card__submit">
                Nastavi
              </Button>
              <small>
                Dokumenti ostaju u lokalnom radnom toku, a pristup je zaključan dok prijava ne prođe.
              </small>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAuthenticated && workspace === 'home' && isDragging && (
          <motion.div
            className="global-drop-overlay"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <motion.div
              className="global-drop-overlay__frame"
              initial={{ scale: 0.99 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className="global-drop-overlay__icon"><Upload size={30} /></span>
              <strong>Pustite dokument bilo gdje</strong>
              <small>Slike i PDF dokumenti spremni su za obradu</small>
              <span className="global-drop-overlay__formats">PNG · JPG · WEBP · PDF</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.button
            aria-label="Zatvori navigaciju"
            className="sidebar-scrim lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {projectModalOpen && (
          <motion.div
            className="project-modal"
            role="presentation"
            onMouseDown={() => setProjectModalOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="project-modal__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div className="project-modal__header">
                <div>
                  <span>Digitalna kulturna baština</span>
                  <h2 id="project-modal-title">O projektu Bosančica AI</h2>
                </div>
                <Button type="button" onClick={() => setProjectModalOpen(false)} aria-label="Zatvori prozor">
                  <X size={16} />
                </Button>
              </div>

              <div className="project-modal__content">
                <p>
                  Bosančica AI je istraživački digitalni alat namijenjen očuvanju, proučavanju i
                  lakšem čitanju historijskih dokumenata pisanih bosančicom.
                </p>
                <p>
                  Projekt povezuje obradu slike, segmentaciju rukopisnih redova i modele optičkog
                  prepoznavanja znakova kako bi izvorni zapis pretvorio u čitljivu latinicu, uz
                  mogućnost stručnog pregleda i ispravke rezultata.
                </p>
                <p>
                  Cilj projekta je približiti vrijednu pisanu baštinu Bosne i Hercegovine
                  istraživačima, studentima i široj javnosti, te podržati njeno dugoročno digitalno
                  očuvanje. Automatski rezultati služe kao pomoć u istraživanju i trebaju se
                  provjeriti prema izvornom dokumentu.
                </p>
              </div>

              <div className="project-modal__actions">
                <Button type="button" onClick={() => setProjectModalOpen(false)}>Zatvori</Button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <aside
        className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${
          mobileSidebarOpen ? 'sidebar--mobile-open' : ''
        }`}
      >
        <div className="sidebar__top">
          <Button className="brand" onClick={startNewConversation} aria-label={t('Bosančica AI početna')}>
            <span className="brand__mark">Б</span>
            {!sidebarCollapsed && (
              <span className="brand__copy">
                <strong>bosančica.ai</strong>
                <small>{t('digitalna baština')}</small>
              </span>
            )}
          </Button>
        </div>

        <PrimaryButton className="new-chat-button" onClick={startNewConversation}>
          <Plus size={18} />
          {!sidebarCollapsed && <span>{t('Novi dokument')}</span>}
        </PrimaryButton>

        <nav className="sidebar__nav" aria-label={t('Glavna navigacija')}>
          <Button className={workspace === 'archive' ? 'is-active' : ''} onClick={() => navigate('archive')}>
            <Bot size={19} />
            {!sidebarCollapsed && (
              <>
                <span>{t('AI trener')}</span>
              </>
            )}
          </Button>
          <Button className={workspace === 'letters' ? 'is-active' : ''} onClick={() => navigate('letters')}>
            <Archive size={19} />
            {!sidebarCollapsed && <span>{t('Arhiva slova')}</span>}
          </Button>
          <Button className={workspace === 'book' ? 'is-active' : ''} onClick={() => navigate('book')}>
            <BookOpen size={19} />
            {!sidebarCollapsed && <span>{t('Digitalna zbirka')}</span>}
          </Button>
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar__history">
            <div className="sidebar__section-label">
              <span>{t('Nedavno')}</span>
              <span className="sidebar__section-actions">
                <History size={13} />
                <Button
                  className="sidebar-history-clear"
                  onClick={clearChatHistory}
                  disabled={!recentDocuments.length || recentDocumentsHaveProcessingJobs || activeUploadIsProcessing}
                  aria-label={t('Obriši historiju razgovora')}
                  title={
                    recentDocumentsHaveProcessingJobs || activeUploadIsProcessing
                      ? t('Sačekajte da se obrada završi')
                      : t('Obriši historiju')
                  }
                >
                  <Trash2 size={13} />
                </Button>
              </span>
            </div>
            {recentDocuments.map((document) => {
              const isProcessing = isRecentDocumentProcessing(document)
                || (activeUploadIsProcessing && isRecentDocumentActiveUpload(document));
              const hasFailed = ['failed', 'cancelled'].includes(document.segmentJob?.status ?? '')
                || ['failed', 'cancelled'].includes(document.segmentJob?.ocr_job?.status ?? '');
              const isSelected = (selectedSegmentJob !== null && document.segmentJob?.id === selectedSegmentJob.id)
                || (pendingUploadBatchId !== null
                  && (document.uploadBatchId === pendingUploadBatchId || document.id === pendingUploadBatchId));

              return (
                <div
                  key={document.id}
                  className={`sidebar-history-row${isProcessing ? ' is-processing' : ''}${hasFailed ? ' is-failed' : ''}${isSelected ? ' is-selected' : ''}`}
                >
                  <Button
                    className="sidebar-history-item"
                    onClick={() => openRecentDocument(document)}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    <MessageSquareText size={15} />
                    <span>{document.title}</span>
                    {isProcessing && (
                      <i
                        className="sidebar-history-item__spinner"
                        role="status"
                        aria-label={t('Obrada u toku')}
                      />
                    )}
                  </Button>
                  <Button
                    className="sidebar-history-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (historyMenuDocumentId === document.id) {
                        setHistoryMenuDocumentId(null);
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const menuHeight = 76;
                      const top = window.innerHeight - rect.bottom >= menuHeight + 8
                        ? rect.bottom + 4
                        : Math.max(8, rect.top - menuHeight - 4);
                      setHistoryMenuPosition({
                        top,
                        right: Math.max(8, window.innerWidth - rect.right),
                      });
                      setHistoryMenuDocumentId(document.id);
                    }}
                    aria-label={t('Opcije dokumenta')}
                    title={t('Opcije dokumenta')}
                  >
                    <EllipsisVertical size={16} />
                  </Button>
                  {historyMenuDocumentId === document.id && historyMenuPosition && createPortal(
                    <div className="sidebar-history-menu" style={historyMenuPosition}>
                      <Button onClick={() => downloadHistoryDocument(document)}>
                        <Download size={14} /> {t('Preuzmi')}
                      </Button>
                      <Button className="is-danger" onClick={() => void removeHistoryDocument(document)}>
                        <Trash2 size={14} /> {t('Ukloni')}
                      </Button>
                    </div>,
                    window.document.body,
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="sidebar__footer" ref={profileMenuRef}>
          <AnimatePresence>
            {profileMenuOpen && !sidebarCollapsed && (
              <motion.div
                className="profile-menu"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
              >
                <Button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    navigate('trainer');
                  }}
                >
                  <Settings size={16} /> {t('Postavke')}
                </Button>
                <Button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setProjectModalOpen(true);
                  }}
                >
                  <BookOpen size={16} /> {t('O projektu')}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button className="profile-button" onClick={() => setProfileMenuOpen((value) => !value)}>
            <span className="profile-button__avatar"><UserRound size={17} /></span>
            {!sidebarCollapsed && (
              <span className="profile-button__copy">
                <strong>{t('Istraživač')}</strong>
                <small>{t('Radni prostor BiH')}</small>
              </span>
            )}
            {!sidebarCollapsed && <ChevronDown size={15} />}
          </Button>
        </div>
      </aside>

      <section ref={mainShellRef} className="main-shell">
        <header className="topbar">
          <IconButton
            className="icon-button"
            onClick={toggleSidebar}
            aria-label={t('Prikaži ili sakrij navigaciju')}
          >
            <span className="hidden lg:grid place-items-center">
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </span>
            <span className="mobile-topbar-logo grid lg:hidden">Б</span>
          </IconButton>

          <div className="topbar__title">
            <span>{t(workspaceMeta[workspace].eyebrow)}</span>
            <strong>{t(workspaceMeta[workspace].label)}</strong>
          </div>

          <div className="topbar__preferences">
            <IconButton
              className="topbar__preference-button"
              onClick={() => setAppPreferences((current) => ({
                ...current,
                theme: current.theme === 'dark' ? 'light' : 'dark',
              }))}
              aria-label={t(appPreferences.theme === 'dark' ? 'Uključi svijetlu temu' : 'Uključi tamnu temu')}
              data-bs-toggle="tooltip"
              data-bs-placement="bottom"
              data-bs-title={t(appPreferences.theme === 'dark' ? 'Svijetla tema' : 'Tamna tema')}
            >
              {appPreferences.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <IconButton
              className="topbar__preference-button topbar__language-button"
              onClick={() => setAppPreferences((current) => ({
                ...current,
                language: current.language === 'bs' ? 'en' : 'bs',
              }))}
              aria-label={appPreferences.language === 'bs' ? 'Switch to English' : 'Prebaci na bosanski'}
              data-bs-toggle="tooltip"
              data-bs-placement="bottom"
              data-bs-title={appPreferences.language === 'bs' ? 'English' : 'Bosanski'}
            >
              <Languages size={17} />
              <small>{appPreferences.language.toUpperCase()}</small>
            </IconButton>
          </div>

          <div className="topbar__gpu">
            <i />
            <div>
              <small>{gpuInfo.statusLabel}</small>
              <strong>{gpuInfo.name}</strong>
            </div>
            <div className="mini-meter" aria-label={gpuInfo.statusLabel}>
              <span /><span /><span /><span />
            </div>
          </div>
        </header>

        <main className={workspace === 'home' ? 'main-content main-content--home' : workspace === 'book' ? 'main-content main-content--book' : 'main-content'}>
          <AnimatePresence mode="wait">
            {workspace === 'home' ? (
              <motion.section
                key="home"
                className="upload-home"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                <AnimatePresence mode="wait">
                  <motion.h1
                    key={greetingIndex}
                    className="home-greeting"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    {t(HOME_GREETINGS[greetingIndex])}
                  </motion.h1>
                </AnimatePresence>
                <div
                  className={`upload-composer ${isDragging ? 'is-dragging' : ''}`}
                >
                  <input
                    ref={singleImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) openUploadedDocuments(Array.from(event.target.files));
                    }}
                  />
                  <input
                    ref={multiImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) openUploadedDocuments(Array.from(event.target.files));
                    }}
                  />
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) openUploadedDocuments(Array.from(event.target.files));
                    }}
                  />
                  <div className="home-composer__attach-wrap" ref={uploadMenuRef}>
                    <Button
                      className="home-composer__attach"
                      onClick={() => setUploadMenuOpen((value) => !value)}
                      aria-label={t('Odaberi način dodavanja dokumenta')}
                      aria-expanded={uploadMenuOpen}
                    >
                      <Plus size={25} />
                      <i />
                    </Button>
                    <AnimatePresence>
                      {uploadMenuOpen && (
                        <motion.div
                          className="upload-source-menu"
                          initial={{ opacity: 0, y: 8, scale: .98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: .98 }}
                          transition={{ duration: .16 }}
                        >
                          <span className="upload-source-menu__label">{t('Dodaj izvor')}</span>
                          <Button onClick={() => { setUploadMenuOpen(false); singleImageInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><ImageIcon size={18} /></span>
                            <span><strong>{t('Dodaj jednu sliku')}</strong><small>{t('Jedna stranica ili natpis')}</small><em>PNG · JPG · WEBP</em></span>
                          </Button>
                          <Button onClick={() => { setUploadMenuOpen(false); multiImageInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><Images size={18} /></span>
                            <span><strong>{t('Dodaj više slika')}</strong><small>{t('Batch stranica istog dokumenta')}</small><em>PNG · JPG · WEBP</em></span>
                          </Button>
                          <Button onClick={() => { setUploadMenuOpen(false); documentInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><FileText size={18} /></span>
                            <span><strong>{t('Dodaj dokument')}</strong><small>{t('Učitaj digitalni dokument')}</small><em>PDF</em></span>
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder={t('Upišite ime dokumenta…')}
                    maxLength={80}
                    aria-label={t('Ime dokumenta')}
                    className="home-composer__input"
                  />

                  <div className="mode-picker home-composer__model" ref={modeMenuRef}>
                      <AnimatePresence>
                        {modeMenuOpen && (
                          <motion.div
                            className="mode-menu model-menu"
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.16 }}
                          >
                            <span className="mode-menu__label">{t('Odaberite model')}</span>
                            <div className="model-menu__options">
                              {visibleModelOptions.map((option) => (
                                <Button
                                  type="button"
                                  key={option.id}
                                  className={selectedModel === option.id ? 'is-selected' : ''}
                                  onClick={() => {
                                    setSelectedModel(option.id);
                                    setModeMenuOpen(false);
                                  }}
                                >
                                  <span className="mode-menu__icon"><Bot size={18} /></span>
                                  <span>
                                  <strong>{option.label}{shouldShowModelBadge(option.badge) && <> <em>{localizeModelBadge(option.badge!, appPreferences.language)}</em></>}</strong>
                                    <small>{option.description}</small>
                                  </span>
                                  {selectedModel === option.id && <Check size={16} />}
                                </Button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <Button
                        type="button"
                        className="home-model-trigger"
                        onClick={() => setModeMenuOpen((value) => !value)}
                        aria-expanded={modeMenuOpen}
                      >
                        <span>{activeModel.label}</span>
                        <ChevronDown size={15} />
                      </Button>
                  </div>

                </div>

                <p className="upload-home__note"><ShieldCheck size={13} /> {t('Dokument se obrađuje sigurno i ne pohranjuje bez vaše dozvole.')}</p>
              </motion.section>
            ) : (
              <motion.section
                key={workspace}
                className="workspace-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24 }}
              >
                {workspace === 'scanner' && (
                  <>
                    <header className={`transcription-modelbar ${transcriptionControlsCollapsed ? 'is-collapsed' : ''}`} aria-label="Kontrole obrade dokumenta">
                      <Button
                        type="button"
                        className="transcription-modelbar__collapse"
                        aria-label={t(transcriptionControlsCollapsed ? 'Prikaži kontrole obrade' : 'Sakrij kontrole obrade')}
                        title={t(transcriptionControlsCollapsed ? 'Prikaži kontrole obrade' : 'Sakrij kontrole obrade')}
                        aria-expanded={!transcriptionControlsCollapsed}
                        onClick={() => setTranscriptionControlsCollapsed((collapsed) => !collapsed)}
                      >
                        <Settings size={18} />
                      </Button>
                      <div className="mode-picker" ref={modeMenuRef}>
                        <AnimatePresence>
                          {modeMenuOpen && (
                            <motion.div
                              className="mode-menu transcription-model-menu"
                              initial={{ opacity: 0, y: -6, scale: .98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: .98 }}
                            >
                              <span className="mode-menu__label">Dostupni lokalni modeli</span>
                              <div className="model-menu__options">
                                {visibleModelOptions.map((option) => (
                                  <Button
                                    type="button"
                                    key={option.id}
                                    className={selectedModel === option.id ? 'is-selected' : ''}
                                    onClick={() => {
                                      setSelectedModel(option.id);
                                      setModeMenuOpen(false);
                                    }}
                                  >
                                    <span className="mode-menu__icon"><Bot size={18} /></span>
                                    <span>
                                    <strong>{option.label}{shouldShowModelBadge(option.badge) && <> <em>{localizeModelBadge(option.badge!, appPreferences.language)}</em></>}</strong>
                                      <small>{option.description}</small>
                                    </span>
                                    {selectedModel === option.id && <Check size={16} />}
                                  </Button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <Button
                          type="button"
                          className="transcription-modelbar__model"
                          onClick={() => setModeMenuOpen((value) => !value)}
                        >
                          <span><Bot size={17} /></span>
                          <div><small>Model transliteracije</small><strong>{activeModel.label}</strong></div>
                          <ChevronDown size={14} />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        disabled={scanProcessStatus.stage === 'transliterating'}
                        onClick={() => scanWorkflowRef.current?.startSegmentation()}
                        className={`transcription-modelbar__process ${scanProcessStatus.stage === 'segmenting' ? 'is-running' : ''} ${segmentationComplete ? 'is-complete' : ''} ${segmentationFailed ? 'is-failed' : ''}`}
                      >
                        <ScanLine size={16} />
                        <div>
                          <small>Segmentacija</small>
                          <strong>
                            {scanProcessStatus.stage === 'segmenting'
                              ? `U toku ${scanProcessStatus.progress}%`
                              : segmentationFailed
                                ? 'Greška – pokušaj ponovo'
                                : segmentationComplete
                                ? 'Pokreni ponovo segmentaciju'
                                : 'Pokreni segmentaciju'}
                          </strong>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        disabled={scanProcessStatus.stage !== 'segmented' && scanProcessStatus.stage !== 'complete' && scanProcessStatus.stage !== 'transliterating'}
                        onClick={() => (
                          transliterationComplete
                            ? scanWorkflowRef.current?.showTransliteration()
                            : scanWorkflowRef.current?.startTransliteration()
                        )}
                        className={`transcription-modelbar__process ${scanProcessStatus.stage === 'transliterating' ? 'is-running' : ''} ${transliterationComplete ? 'is-complete' : ''} ${scanProcessStatus.stage === 'segmented' ? 'is-ready' : ''}`}
                      >
                        <Languages size={16} />
                        <div>
                          <small>Transliteracija</small>
                          <strong>
                            {scanProcessStatus.stage === 'transliterating'
                              ? `U toku ${scanProcessStatus.progress}%`
                              : transliterationComplete
                                ? `Gotova · ${scanProcessStatus.transliterationModel || activeModel.label}`
                                : scanProcessStatus.stage === 'segmented'
                                  ? 'Pokreni transliteraciju'
                                  : 'Čeka segmentaciju'}
                          </strong>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        disabled={!transliterationComplete || scanProcessStatus.stage === 'normalizing'}
                        onClick={() => scanWorkflowRef.current?.startNormalization()}
                        className={`transcription-modelbar__process ${scanProcessStatus.stage === 'normalizing' ? 'is-running' : ''} ${normalizationComplete ? 'is-complete' : ''} ${transliterationComplete && !normalizationComplete && scanProcessStatus.stage !== 'normalizing' ? 'is-ready' : ''}`}
                      >
                        <Sparkles size={16} />
                        <div>
                          <small>{t('Normalizacija')}</small>
                          <strong>
                            {scanProcessStatus.stage === 'normalizing'
                              ? 'U toku…'
                              : normalizationComplete
                                ? `Gotova · ${scanProcessStatus.normalizationModel || 'Gemini'}`
                                : transliterationComplete
                                  ? 'Pretvori u savremeni bosanski'
                                  : 'Čeka transliteraciju'}
                          </strong>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        disabled={!reviewAvailable || reviewSubmitting}
                        onClick={() => {
                          setReviewSubmitting(true);
                          void scanWorkflowRef.current?.confirmResearcherReview()
                            .finally(() => setReviewSubmitting(false));
                        }}
                        className={`transcription-modelbar__review ${researcherReviewed ? 'is-complete' : ''}`}
                      >
                        <ShieldCheck size={16} />
                        <div>
                          <small>Kontrola istraživača</small>
                          <strong>{reviewSubmitting ? 'Čuvanje korekcija…' : researcherReviewed ? 'Potvrđeno · spremno za trening' : 'Označi kontrolu'}</strong>
                        </div>
                      </Button>
                    </header>
                    <ScanWorkflow
                      ref={scanWorkflowRef}
                      key={`scanner-${documentSelectionNonce}`}
                      onScanCompleted={(newScan) => setScansHistory((current) => [newScan, ...current])}
                      initialFiles={pendingUploads}
                      initialUploadBatchId={pendingUploadBatchId}
                      initialPresetId={selectedPresetId}
                      initialSegmentJob={selectedSegmentJob}
                      resumeProgress={selectedSegmentJob ? segmentProgressByJobId[selectedSegmentJob.id] : undefined}
                      initialDocumentName={documentName.trim()}
                      modelId={activeModel.id}
                      modelName={activeModel.label}
                      focusDocumentView={documentFocusMode}
                      researcherReviewed={researcherReviewed}
                      onResearcherReviewedChange={setResearcherReviewed}
                      onReviewAvailabilityChange={setReviewAvailable}
                      onProcessStatusChange={handleProcessStatusChange}
                      onSegmentHistoryChange={refreshSegmentHistory}
                      language={appPreferences.language}
                    />
                  </>
                )}
                {workspace === 'archive' && (
                  <LetterTrainerWorkspace />
                )}

                {workspace === 'letters' && (
                  <LetterArchive />
                )}
                {workspace === 'book' && (
                  <BookWorkspace books={bookDocuments} loading={bookLoading} />
                )}
                {workspace === 'trainer' && (
                  <SettingsWorkspace
                    language={appPreferences.language}
                    theme={appPreferences.theme}
                    models={modelOptions}
                    disabledModelIds={appPreferences.disabledModelIds}
                    onLanguageChange={(language) => setAppPreferences((current) => ({ ...current, language }))}
                    onThemeChange={(theme) => setAppPreferences((current) => ({ ...current, theme }))}
                    onModelEnabledChange={(modelId, enabled) => setAppPreferences((current) => ({
                      ...current,
                      disabledModelIds: enabled
                        ? current.disabledModelIds.filter((id) => id !== modelId)
                        : [...new Set([...current.disabledModelIds, modelId])],
                    }))}
                  />
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </section>

      {(canScrollUp || canScrollDown) && (
        <div className="scroll-controls" aria-label="Kontrole pomicanja stranice">
          {canScrollUp && (
            <Button
              type="button"
              className="scroll-controls__button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Idi na vrh stranice"
              title="Idi na vrh"
            >
              <ChevronUp size={20} aria-hidden="true" />
            </Button>
          )}
          {canScrollDown && (
            <Button
              type="button"
              className="scroll-controls__button"
              onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
              aria-label="Idi na dno stranice"
              title="Idi na dno"
            >
              <ChevronDown size={20} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
