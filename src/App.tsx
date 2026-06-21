import { DragEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  History,
  FileImage,
  Gauge,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  Settings,
  ShieldCheck,
  Server,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { MOCK_HISTORY, MOCK_VALIDATION_SAMPLES, PRESET_DOCUMENTS } from './data';
import { ScanItem, ValidationSample } from './types';
import ScanWorkflow from './components/ScanWorkflow';
import LetterArchive from './components/LetterArchive';
import TrainerDashboard from './components/TrainerDashboard';
import Button from './components/ui/Button';
import IconButton from './components/ui/IconButton';
import useGpuInfo from './hooks/useGpuInfo';

type Workspace = 'home' | 'scanner' | 'archive' | 'trainer';
type RecentDocument = {
  id: string;
  title: string;
  presetId?: string;
  files?: File[];
};

const workspaceMeta: Record<Workspace, { label: string; eyebrow: string }> = {
  home: { label: 'Novi dokument', eyebrow: 'Bosančica AI' },
  scanner: { label: 'Skeniranje i transliteracija', eyebrow: 'OCR laboratorija' },
  archive: { label: 'Arhiv slova', eyebrow: 'Digitalna zbirka' },
  trainer: { label: 'AI trener', eyebrow: 'Nadzor modela' },
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
    description: 'qla.dev local server',
    badge: 'Lokalno',
  },
];

export default function App() {
  const gpuInfo = useGpuInfo();
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [selectedModel, setSelectedModel] = useState(modelOptions[0].id);
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [documentSelectionNonce, setDocumentSelectionNonce] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scansHistory, setScansHistory] = useState<ScanItem[]>(MOCK_HISTORY);
  const [validationQueue, setValidationQueue] = useState<ValidationSample[]>(MOCK_VALIDATION_SAMPLES);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(
    PRESET_DOCUMENTS.map((document) => ({
      id: document.id,
      title: document.title,
      presetId: document.id,
    })),
  );
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const homeFileInputRef = useRef<HTMLInputElement>(null);
  const mainShellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modeMenuRef.current?.contains(target)) setModeMenuOpen(false);
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

  const startNewConversation = () => {
    setPendingUploads([]);
    setSelectedPresetId(null);
    navigate('home');
  };

  const openUploadedDocuments = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    const title = images.length === 1 ? images[0].name : `${images[0].name} + ${images.length - 1}`;
    const item: RecentDocument = { id: `upload-${Date.now()}`, title, files: images };
    setPendingUploads(images);
    setSelectedPresetId(null);
    setDocumentSelectionNonce((value) => value + 1);
    setRecentDocuments((current) => [item, ...current].slice(0, 7));
    navigate('scanner');
  };

  const openRecentDocument = (document: RecentDocument) => {
    setPendingUploads([...(document.files ?? [])]);
    setSelectedPresetId(document.presetId ?? null);
    setDocumentSelectionNonce((value) => value + 1);
    navigate('scanner');
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    openUploadedDocuments(Array.from(event.dataTransfer.files));
  };

  const activeModel = modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0];

  return (
    <div className="app-shell">
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
          <IconButton
            className="icon-button hidden lg:grid"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Proširi navigaciju' : 'Sakrij navigaciju'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
          <IconButton
            className="icon-button lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Zatvori navigaciju"
          >
            <X size={19} />
          </IconButton>
        </div>

        <Button className="new-chat-button" onClick={startNewConversation}>
          <Plus size={18} />
          {!sidebarCollapsed && <span>Novi dokument</span>}
        </Button>

        <nav className="sidebar__nav" aria-label="Glavna navigacija">
          <Button className={workspace === 'scanner' ? 'is-active' : ''} onClick={() => navigate('scanner')}>
            <ScanLine size={19} />
            {!sidebarCollapsed && <span>Transliteracija</span>}
          </Button>
          <Button className={workspace === 'archive' ? 'is-active' : ''} onClick={() => navigate('archive')}>
            <Archive size={19} />
            {!sidebarCollapsed && <span>Arhiv slova</span>}
          </Button>
          <Button className={workspace === 'trainer' ? 'is-active' : ''} onClick={() => navigate('trainer')}>
            <Bot size={19} />
            {!sidebarCollapsed && (
              <>
                <span>AI trener</span>
                {validationQueue.length > 0 && <em>{validationQueue.length}</em>}
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
                <Button><Settings size={16} /> Postavke</Button>
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
            className="icon-button lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Otvori navigaciju"
          >
            <Menu size={20} />
          </IconButton>

          <div className="topbar__title">
            <span>{workspaceMeta[workspace].eyebrow}</span>
            <strong>{workspaceMeta[workspace].label}</strong>
          </div>

          <div className="topbar__status">
            <span className="status-dot" />
            <span>OCR sistem spreman</span>
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
                <div className="upload-panel">
                  <input
                    ref={homeFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) openUploadedDocuments(Array.from(event.target.files));
                    }}
                  />
                  <Button
                    type="button"
                    className={`upload-dropzone ${isDragging ? 'is-dragging' : ''}`}
                    onClick={() => homeFileInputRef.current?.click()}
                    onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <span className="upload-dropzone__icon"><FileImage size={30} /></span>
                    <strong>Prevucite dokumente ovdje</strong>
                    <small>jedna fotografija ili cijeli niz stranica</small>
                    <em><Upload size={15} /> Odaberi slike</em>
                    <span className="upload-dropzone__formats">PNG, JPG ili WEBP · multiple upload</span>
                  </Button>

                  <div className="model-row">
                    <div>
                      <strong>Model za obradu</strong>
                      <small>Odaberite AI model koji će čitati dokument</small>
                    </div>
                    <div className="mode-picker" ref={modeMenuRef}>
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
                        className="model-picker__trigger"
                        onClick={() => setModeMenuOpen((value) => !value)}
                      >
                        <span className="model-picker__mark"><Bot size={17} /></span>
                        <span><strong>{activeModel.label}</strong><small>{activeModel.description}</small></span>
                        <ChevronDown size={15} />
                      </Button>
                    </div>
                  </div>

                  <div className="gpu-card">
                    <span className="gpu-card__server"><Server size={18} /></span>
                    <div className="gpu-card__identity">
                      <span><i /> GPU ovog uređaja</span>
                      <strong>{gpuInfo.name}</strong>
                    </div>
                    <div className="gpu-card__meter" aria-label="Grafička aktivna">
                      <span /><span /><span /><span /><span />
                    </div>
                    <div className={`gpu-card__state gpu-card__state--${gpuInfo.status}`}>
                      <Gauge size={14} /><span>{gpuInfo.statusLabel}</span>
                    </div>
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
                              <Button type="button" className="is-selected" onClick={() => setModeMenuOpen(false)}>
                                <span className="mode-menu__icon"><Bot size={18} /></span>
                                <span><strong>{activeModel.label}<em>Lokalno</em></strong><small>{activeModel.description}</small></span>
                                <Check size={16} />
                              </Button>
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
                      <div className="transcription-modelbar__gpu">
                        <i />
                        <div><small>GPU ovog uređaja</small><strong>{gpuInfo.name}</strong></div>
                        <div className="mini-meter"><span /><span /><span /><span /></div>
                      </div>
                    </div>
                    <ScanWorkflow
                      key={`scanner-${documentSelectionNonce}`}
                      onScanCompleted={(newScan) => setScansHistory((current) => [newScan, ...current])}
                      scansHistory={scansHistory}
                      initialFiles={pendingUploads}
                      initialPresetId={selectedPresetId}
                      modelName={activeModel.label}
                    />
                  </>
                )}
                {workspace === 'archive' && (
                  <LetterArchive onAddTrainingSample={(sample) => setValidationQueue((current) => [sample, ...current])} />
                )}
                {workspace === 'trainer' && (
                  <TrainerDashboard
                    validationQueue={validationQueue}
                    onApproveSample={(id) => setValidationQueue((current) => current.filter((item) => item.id !== id))}
                    onRejectSample={(id) => setValidationQueue((current) => current.filter((item) => item.id !== id))}
                  />
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </section>
    </div>
  );
}
