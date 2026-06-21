import { DragEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  FileText,
  History,
  Image as ImageIcon,
  Images,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  Settings,
  ShieldCheck,
  UserRound,
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

const HOME_GREETINGS = [
  'Zdravo, istraživaču. Na kojem dokumentu radimo danas?',
  'Koji trag prošlosti danas čitamo?',
  'Spremni za novu transliteraciju?',
  'Donesite dokument. Otkrijmo šta u njemu piše.',
  'Koju ćemo stranicu historije danas otvoriti?',
  'Novi dokument, nova priča. Počnimo.',
];

export default function App() {
  const gpuInfo = useGpuInfo();
  const [greetingIndex, setGreetingIndex] = useState(() => Math.floor(Math.random() * HOME_GREETINGS.length));
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [selectedModel, setSelectedModel] = useState(modelOptions[0].id);
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [documentSelectionNonce, setDocumentSelectionNonce] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
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
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const multiImageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const mainShellRef = useRef<HTMLElement>(null);

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
    setDocumentSelectionNonce((value) => value + 1);
    setRecentDocuments((current) => [item, ...current].slice(0, 7));
    navigate('scanner');
  };

  const openRecentDocument = (document: RecentDocument) => {
    setDocumentName(document.title);
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
            className="icon-button"
            onClick={toggleSidebar}
            aria-label="Prikaži ili sakrij navigaciju"
          >
            <span className="hidden lg:grid place-items-center">
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </span>
            <span className="grid lg:hidden place-items-center">
              {mobileSidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </span>
          </IconButton>

          <div className="topbar__title">
            <span>{workspaceMeta[workspace].eyebrow}</span>
            <strong>{workspaceMeta[workspace].label}</strong>
          </div>

          <div className="topbar__gpu">
            <i />
            <div>
              <small>GPU spreman</small>
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
                  className={`upload-panel upload-composer ${isDragging ? 'is-dragging' : ''}`}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
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
                    autoFocus
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
                    </div>
                    <ScanWorkflow
                      key={`scanner-${documentSelectionNonce}`}
                      onScanCompleted={(newScan) => setScansHistory((current) => [newScan, ...current])}
                      scansHistory={scansHistory}
                      initialFiles={pendingUploads}
                      initialPresetId={selectedPresetId}
                      initialDocumentName={documentName.trim()}
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
