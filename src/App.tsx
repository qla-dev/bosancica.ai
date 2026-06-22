import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  FileText,
  History,
  Image as ImageIcon,
  Images,
  MessageSquareText,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
} from 'lucide-react';
import { MOCK_HISTORY } from './data';
import { ScanItem } from './types';
import ScanWorkflow, { type ScanProcessStatus, type ScanWorkflowHandle } from './components/ScanWorkflow';
import LetterArchive from './components/LetterArchive';
import TrainerDashboard from './components/TrainerDashboard';
import { listSegmentJobs, type SegmentJob } from './api/ocrJobs';
import Button from './components/ui/Button';
import IconButton from './components/ui/IconButton';
import PrimaryButton from './components/ui/PrimaryButton';
import useGpuInfo from './hooks/useGpuInfo';

type Workspace = 'home' | 'scanner' | 'archive' | 'trainer';
type RecentDocument = {
  id: string;
  title: string;
  presetId?: string;
  files?: File[];
  segmentJob?: SegmentJob;
};

const workspaceMeta: Record<Workspace, { label: string; eyebrow: string }> = {
  home: { label: 'Novi dokument', eyebrow: 'Bosančica AI' },
  scanner: { label: 'Skeniranje i transliteracija', eyebrow: 'OCR laboratorija' },
  archive: { label: 'AI trainer slova', eyebrow: 'Digitalna zbirka' },
  trainer: { label: 'Postavke', eyebrow: 'Konfiguracija modela' },
};

const modelOptions: Array<{
  id: string;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    id: 'kraken-bvision-local',
    label: 'Kraken BVision OCR',
    description: 'qla.dev local server · :8002',
    badge: 'Lokalno',
  },
  {
    id: 'kraken-2-local',
    label: 'Kraken 2',
    description: 'Docker segmenter · :8003',
    badge: 'Novo',
  },
];

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

const recentDocumentFromSegmentJob = (job: SegmentJob): RecentDocument => ({
  id: `segment-${job.id}`,
  title: job.document_name || job.original_filename || `Dokument #${job.id}`,
  segmentJob: job,
});

const processStatusFromSegmentJob = (job: SegmentJob): ScanProcessStatus => {
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

  if (job.status === 'pending' || job.status === 'running') {
    return {
      stage: 'segmenting',
      progress: job.status === 'running' ? 60 : 25,
      segmentationModel: job.model_name ?? undefined,
    };
  }

  return { stage: 'idle', progress: 0, segmentationModel: job.model_name ?? undefined };
};

export default function App() {
  const gpuInfo = useGpuInfo();
  const [authSessionExpiresAt, setAuthSessionExpiresAt] = useState<number | null>(readAuthSessionExpiration);
  const isAuthenticated = authSessionExpiresAt !== null;
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [greetingIndex, setGreetingIndex] = useState(() => Math.floor(Math.random() * HOME_GREETINGS.length));
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [selectedModel, setSelectedModel] = useState(modelOptions[0].id);
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [documentSelectionNonce, setDocumentSelectionNonce] = useState(0);
  const [documentFocusMode, setDocumentFocusMode] = useState(false);
  const [researcherReviewed, setResearcherReviewed] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(true);
  const [scanProcessStatus, setScanProcessStatus] = useState<ScanProcessStatus>({ stage: 'idle', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scansHistory, setScansHistory] = useState<ScanItem[]>(MOCK_HISTORY);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [selectedSegmentJob, setSelectedSegmentJob] = useState<SegmentJob | null>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const multiImageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const mainShellRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const scanWorkflowRef = useRef<ScanWorkflowHandle>(null);

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

  const refreshSegmentHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const jobs = await listSegmentJobs(signal);
      const persistedDocuments = jobs.map(recentDocumentFromSegmentJob);

      setRecentDocuments((current) => {
        const persistedTitles = new Set(persistedDocuments.map((document) => document.title));
        const activeUploads = current.filter((document) => (
          document.files?.length
          && !document.segmentJob
          && !persistedTitles.has(document.title)
        ));
        return [...activeUploads, ...persistedDocuments].slice(0, 20);
      });
    } catch {
      // The scanner still works if history cannot be refreshed.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    void refreshSegmentHistory(controller.signal);

    return () => controller.abort();
  }, [isAuthenticated, refreshSegmentHistory]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modeMenuRef.current?.contains(target)) setModeMenuOpen(false);
      if (!uploadMenuRef.current?.contains(target)) setUploadMenuOpen(false);
      if (!profileMenuRef.current?.contains(target)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
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

  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((value) => !value);
    } else {
      setMobileSidebarOpen((value) => !value);
    }
  };

  const startNewConversation = () => {
    setPendingUploads([]);
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

  const openUploadedDocuments = (files: File[]) => {
    const supportedFiles = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (!supportedFiles.length) return;
    const fallbackTitle = supportedFiles.length === 1
      ? supportedFiles[0].name
      : `${supportedFiles[0].name} + ${supportedFiles.length - 1}`;
    const title = documentName.trim() || fallbackTitle;
    const item: RecentDocument = { id: `upload-${Date.now()}`, title, files: supportedFiles };
    setPendingUploads(supportedFiles);
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
    if (nextModelId && modelOptions.some((option) => option.id === nextModelId)) {
      setSelectedModel(nextModelId);
    }

    setDocumentName(document.title);
    setPendingUploads([...(document.files ?? [])]);
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
  };

  const activeModel = modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0];
  const averageAccuracy = scansHistory.length
    ? scansHistory.reduce((sum, scan) => sum + scan.accuracy, 0) / scansHistory.length
    : 0;
  const segmentationComplete = ['segmented', 'transliterating', 'complete'].includes(scanProcessStatus.stage);
  const transliterationComplete = scanProcessStatus.stage === 'complete';
  const segmentationFailed = scanProcessStatus.stage === 'failed';

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

      <aside
        className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${
          mobileSidebarOpen ? 'sidebar--mobile-open' : ''
        }`}
      >
        <div className="sidebar__top">
          <Button className="brand" onClick={startNewConversation} aria-label="Bosančica AI početna">
            <span className="brand__mark">Б</span>
            {!sidebarCollapsed && (
              <span className="brand__copy">
                <strong>bosančica.ai</strong>
                <small>digitalna baština</small>
              </span>
            )}
          </Button>
        </div>

        <PrimaryButton className="new-chat-button" onClick={startNewConversation}>
          <Plus size={18} />
          {!sidebarCollapsed && <span>Novi dokument</span>}
        </PrimaryButton>

        <nav className="sidebar__nav" aria-label="Glavna navigacija">
          <Button className={workspace === 'archive' ? 'is-active' : ''} onClick={() => navigate('archive')}>
            <Bot size={19} />
            {!sidebarCollapsed && (
              <>
                <span>AI trainer slova</span>
              </>
            )}
          </Button>
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar__history">
            <div className="sidebar__section-label">
              <span>Nedavno</span>
              <History size={13} />
            </div>
            {recentDocuments.map((document) => (
              <Button key={document.id} onClick={() => openRecentDocument(document)}>
                <MessageSquareText size={15} />
                <span>{document.title}</span>
              </Button>
            ))}
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
                  <Settings size={16} /> Postavke
                </Button>
                <Button><BookOpen size={16} /> O projektu</Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button className="profile-button" onClick={() => setProfileMenuOpen((value) => !value)}>
            <span className="profile-button__avatar"><UserRound size={17} /></span>
            {!sidebarCollapsed && (
              <span className="profile-button__copy">
                <strong>Istraživač</strong>
                <small>Radni prostor BiH</small>
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
            aria-label="Prikaži ili sakrij navigaciju"
          >
            <span className="hidden lg:grid place-items-center">
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </span>
            <span className="mobile-topbar-logo grid lg:hidden">Б</span>
          </IconButton>

          <div className="topbar__title">
            <span>{workspaceMeta[workspace].eyebrow}</span>
            <strong>{workspaceMeta[workspace].label}</strong>
          </div>

          <div className="topbar__gpu">
            <i />
            <div>
              <small>
                {gpuInfo.status === 'detected' ? (
                  <>GPU spreman na <span className="topbar__server-name">qla.dev</span> serveru</>
                ) : gpuInfo.statusLabel}
              </small>
              <strong>
                {gpuInfo.name}
                {gpuInfo.memoryMb && gpuInfo.memoryMb > 0 ? ` · ${(gpuInfo.memoryMb / 1024).toFixed(1)} GB VRAM` : ''}
              </strong>
            </div>
            <div className="mini-meter" aria-label={gpuInfo.statusLabel}>
              <span /><span /><span /><span />
            </div>
          </div>
        </header>

        <main className={workspace === 'home' ? 'main-content main-content--home' : 'main-content'}>
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
                    {HOME_GREETINGS[greetingIndex]}
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
                      aria-label="Odaberi način dodavanja dokumenta"
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
                          <span className="upload-source-menu__label">Dodaj izvor</span>
                          <Button onClick={() => { setUploadMenuOpen(false); singleImageInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><ImageIcon size={18} /></span>
                            <span><strong>Dodaj jednu sliku</strong><small>Jedna stranica ili natpis</small><em>PNG · JPG · WEBP</em></span>
                          </Button>
                          <Button onClick={() => { setUploadMenuOpen(false); multiImageInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><Images size={18} /></span>
                            <span><strong>Dodaj više slika</strong><small>Batch stranica istog dokumenta</small><em>PNG · JPG · WEBP</em></span>
                          </Button>
                          <Button onClick={() => { setUploadMenuOpen(false); documentInputRef.current?.click(); }}>
                            <span className="upload-source-menu__icon"><FileText size={18} /></span>
                            <span><strong>Dodaj dokument</strong><small>Učitaj digitalni dokument</small><em>PDF</em></span>
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="Upišite ime dokumenta…"
                    maxLength={80}
                    aria-label="Ime dokumenta"
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
                            <span className="mode-menu__label">Odaberite model</span>
                            {modelOptions.map((option) => (
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
                                  <strong>{option.label}{option.badge && <em>{option.badge}</em>}</strong>
                                  <small>{option.description}</small>
                                </span>
                                {selectedModel === option.id && <Check size={16} />}
                              </Button>
                            ))}
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

                <p className="upload-home__note"><ShieldCheck size={13} /> Dokument se obrađuje sigurno i ne pohranjuje bez vaše dozvole.</p>
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
                    <div className="transcription-modelbar">
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
                              {modelOptions.map((option) => (
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
                                    <strong>{option.label}{option.badge && <em>{option.badge}</em>}</strong>
                                    <small>{option.description}</small>
                                  </span>
                                  {selectedModel === option.id && <Check size={16} />}
                                </Button>
                              ))}
                              <div className="transcription-model-menu__stats" aria-label="Statistika obrade">
                                <div>
                                  <small>Odrađeni skenovi</small>
                                  <strong>{scansHistory.length}</strong>
                                  <span>Aktivan status</span>
                                </div>
                                <div>
                                  <small>Prosjek pouzdanosti</small>
                                  <strong>{averageAccuracy.toFixed(1)}%</strong>
                                  <span>AI model v1.4</span>
                                </div>
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
                        disabled={scanProcessStatus.stage !== 'idle' && scanProcessStatus.stage !== 'failed'}
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
                                ? 'Greska - pokusaj ponovo'
                                : segmentationComplete
                                ? `Gotova · ${scanProcessStatus.segmentationModel || activeModel.label}`
                                : 'Pokreni segmentaciju'}
                          </strong>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        disabled={scanProcessStatus.stage !== 'segmented'}
                        onClick={() => scanWorkflowRef.current?.startTransliteration()}
                        className={`transcription-modelbar__process ${scanProcessStatus.stage === 'transliterating' ? 'is-running' : ''} ${transliterationComplete ? 'is-complete' : ''}`}
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
                        disabled={!reviewAvailable}
                        onClick={() => setResearcherReviewed(true)}
                        className={`transcription-modelbar__review ${researcherReviewed ? 'is-complete' : ''}`}
                      >
                        <ShieldCheck size={16} />
                        <div>
                          <small>Kontrola istraživača</small>
                          <strong>{researcherReviewed ? 'Kontrola potvrđena' : 'Označi kontrolu'}</strong>
                        </div>
                      </Button>
                    </div>
                    <ScanWorkflow
                      ref={scanWorkflowRef}
                      key={`scanner-${documentSelectionNonce}`}
                      onScanCompleted={(newScan) => setScansHistory((current) => [newScan, ...current])}
                      initialFiles={pendingUploads}
                      initialPresetId={selectedPresetId}
                      initialSegmentJob={selectedSegmentJob}
                      initialDocumentName={documentName.trim()}
                      modelId={activeModel.id}
                      modelName={activeModel.label}
                      focusDocumentView={documentFocusMode}
                      researcherReviewed={researcherReviewed}
                      onResearcherReviewedChange={setResearcherReviewed}
                      onReviewAvailabilityChange={setReviewAvailable}
                      onProcessStatusChange={setScanProcessStatus}
                      onSegmentHistoryChange={refreshSegmentHistory}
                    />
                  </>
                )}
                {workspace === 'archive' && (
                  <LetterArchive />
                )}
                {workspace === 'trainer' && (
                  <TrainerDashboard />
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </section>
    </div>
  );
}
