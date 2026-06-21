import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  History,
  Landmark,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Plus,
  ScanLine,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { MOCK_HISTORY, MOCK_VALIDATION_SAMPLES } from './data';
import { ScanItem, ValidationSample } from './types';
import ScanWorkflow from './components/ScanWorkflow';
import LetterArchive from './components/LetterArchive';
import TrainerDashboard from './components/TrainerDashboard';

type Workspace = 'home' | 'scanner' | 'archive' | 'trainer';
type PromptMode = Exclude<Workspace, 'home'>;

const workspaceMeta: Record<Workspace, { label: string; eyebrow: string }> = {
  home: { label: 'Novi razgovor', eyebrow: 'Bosančica AI' },
  scanner: { label: 'Skeniranje i transkripcija', eyebrow: 'OCR laboratorija' },
  archive: { label: 'Arhiv slova', eyebrow: 'Digitalna zbirka' },
  trainer: { label: 'AI trener', eyebrow: 'Nadzor modela' },
};

const modeOptions: Array<{
  id: PromptMode;
  label: string;
  description: string;
  icon: typeof ScanLine;
}> = [
  {
    id: 'scanner',
    label: 'Transkripcija dokumenta',
    description: 'Prepoznaj bosančicu sa slike',
    icon: ScanLine,
  },
  {
    id: 'archive',
    label: 'Istraživanje arhiva',
    description: 'Upoznaj slova i njihove varijante',
    icon: BookOpen,
  },
  {
    id: 'trainer',
    label: 'Treniranje modela',
    description: 'Pregledaj uzorke zajednice',
    icon: ShieldCheck,
  },
];

const starterPrompts: Array<{ title: string; text: string; mode: PromptMode; icon: typeof ScanLine }> = [
  {
    title: 'Prepiši stari dokument',
    text: 'Želim transkribovati fotografiju starog dokumenta.',
    mode: 'scanner',
    icon: ScanLine,
  },
  {
    title: 'Istraži jedno slovo',
    text: 'Pokaži mi karakteristična slova bosančice i njihove varijante.',
    mode: 'archive',
    icon: PenTool,
  },
  {
    title: 'Povelja bana Kulina',
    text: 'Želim istražiti Povelju bana Kulina iz 1189. godine.',
    mode: 'scanner',
    icon: Landmark,
  },
  {
    title: 'Pomozi unaprijediti model',
    text: 'Otvori uzorke koji čekaju stručnu provjeru.',
    mode: 'trainer',
    icon: Sparkles,
  },
];

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [promptMode, setPromptMode] = useState<PromptMode>('scanner');
  const [prompt, setPrompt] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scansHistory, setScansHistory] = useState<ScanItem[]>(MOCK_HISTORY);
  const [validationQueue, setValidationQueue] = useState<ValidationSample[]>(MOCK_VALIDATION_SAMPLES);
  const [recentSessions, setRecentSessions] = useState<string[]>([
    'Povelja bana Kulina',
    'Natpis sa stećka Radoja',
    'Humačka ploča',
  ]);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modeMenuRef.current?.contains(target)) setModeMenuOpen(false);
      if (!profileMenuRef.current?.contains(target)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  const navigate = (next: Workspace) => {
    setWorkspace(next);
    setMobileSidebarOpen(false);
    setModeMenuOpen(false);
  };

  const startNewConversation = () => {
    setPrompt('');
    setPromptMode('scanner');
    navigate('home');
  };

  const launchPrompt = (event?: FormEvent) => {
    event?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (cleanPrompt) {
      const title = cleanPrompt.length > 34 ? `${cleanPrompt.slice(0, 34)}…` : cleanPrompt;
      setRecentSessions((current) => [title, ...current.filter((item) => item !== title)].slice(0, 6));
    }
    navigate(promptMode);
  };

  const chooseStarter = (text: string, mode: PromptMode) => {
    setPrompt(text);
    setPromptMode(mode);
  };

  const selectedMode = modeOptions.find((option) => option.id === promptMode) ?? modeOptions[0];

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
          <button className="brand" onClick={startNewConversation} aria-label="Bosančica AI početna">
            <span className="brand__mark">Б</span>
            {!sidebarCollapsed && (
              <span className="brand__copy">
                <strong>bosančica.ai</strong>
                <small>digitalna baština</small>
              </span>
            )}
          </button>
          <button
            className="icon-button hidden lg:grid"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Proširi navigaciju' : 'Sakrij navigaciju'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            className="icon-button lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Zatvori navigaciju"
          >
            <X size={19} />
          </button>
        </div>

        <button className="new-chat-button" onClick={startNewConversation}>
          <Plus size={18} />
          {!sidebarCollapsed && <span>Novi razgovor</span>}
        </button>

        <nav className="sidebar__nav" aria-label="Glavna navigacija">
          <button className={workspace === 'scanner' ? 'is-active' : ''} onClick={() => navigate('scanner')}>
            <ScanLine size={19} />
            {!sidebarCollapsed && <span>Transkripcija</span>}
          </button>
          <button className={workspace === 'archive' ? 'is-active' : ''} onClick={() => navigate('archive')}>
            <Archive size={19} />
            {!sidebarCollapsed && <span>Arhiv slova</span>}
          </button>
          <button className={workspace === 'trainer' ? 'is-active' : ''} onClick={() => navigate('trainer')}>
            <Bot size={19} />
            {!sidebarCollapsed && (
              <>
                <span>AI trener</span>
                {validationQueue.length > 0 && <em>{validationQueue.length}</em>}
              </>
            )}
          </button>
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar__history">
            <div className="sidebar__section-label">
              <span>Nedavno</span>
              <History size={13} />
            </div>
            {recentSessions.map((session, index) => (
              <button key={`${session}-${index}`} onClick={() => navigate(index === 2 ? 'archive' : 'scanner')}>
                <MessageSquareText size={15} />
                <span>{session}</span>
              </button>
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
                <button><Settings size={16} /> Postavke</button>
                <button><BookOpen size={16} /> O projektu</button>
              </motion.div>
            )}
          </AnimatePresence>
          <button className="profile-button" onClick={() => setProfileMenuOpen((value) => !value)}>
            <span className="profile-button__avatar"><UserRound size={17} /></span>
            {!sidebarCollapsed && (
              <span className="profile-button__copy">
                <strong>Istraživač</strong>
                <small>Radni prostor BiH</small>
              </span>
            )}
            {!sidebarCollapsed && <ChevronDown size={15} />}
          </button>
        </div>
      </aside>

      <section className="main-shell">
        <header className="topbar">
          <button
            className="icon-button lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Otvori navigaciju"
          >
            <Menu size={20} />
          </button>

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
                className="welcome"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                <div className="welcome__hero">
                  <div className="welcome__seal"><span>Б</span></div>
                  <p>AI LABORATORIJA ZA KULTURNU BAŠTINU</p>
                  <h1>Šta ćemo danas<br /><em>otkriti?</em></h1>
                  <span className="welcome__lead">
                    Transkribujte rukopis, istražite starobosanska slova ili pomozite modelu da nauči novi trag prošlosti.
                  </span>
                </div>

                <form className="prompt-box" onSubmit={launchPrompt}>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        launchPrompt();
                      }
                    }}
                    placeholder="Pitaj o dokumentu, slovu ili historijskom natpisu…"
                    rows={2}
                    aria-label="Upit"
                  />
                  <div className="prompt-box__actions">
                    <div className="mode-picker" ref={modeMenuRef}>
                      <AnimatePresence>
                        {modeMenuOpen && (
                          <motion.div
                            className="mode-menu"
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.16 }}
                          >
                            <span className="mode-menu__label">Odaberite alat</span>
                            {modeOptions.map((option) => {
                              const Icon = option.icon;
                              return (
                                <button
                                  type="button"
                                  key={option.id}
                                  className={promptMode === option.id ? 'is-selected' : ''}
                                  onClick={() => {
                                    setPromptMode(option.id);
                                    setModeMenuOpen(false);
                                  }}
                                >
                                  <span className="mode-menu__icon"><Icon size={18} /></span>
                                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                                  {promptMode === option.id && <Check size={16} />}
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <button
                        type="button"
                        className="mode-picker__trigger"
                        onClick={() => setModeMenuOpen((value) => !value)}
                      >
                        <selectedMode.icon size={16} />
                        <span>{selectedMode.label}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="attach-button"
                      onClick={() => navigate('scanner')}
                      aria-label="Dodaj sliku"
                      title="Dodaj sliku"
                    >
                      <Upload size={17} />
                    </button>
                    <button className="send-button" type="submit" aria-label="Pokreni">
                      <Send size={17} />
                    </button>
                  </div>
                </form>

                <div className="starter-grid">
                  {starterPrompts.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.title} onClick={() => chooseStarter(item.text, item.mode)}>
                        <span><Icon size={17} /></span>
                        <strong>{item.title}</strong>
                        <small>{item.text}</small>
                      </button>
                    );
                  })}
                </div>

                <p className="welcome__note">Bosančica AI može pogriješiti. Važne transkripcije provjerite sa stručnjakom.</p>
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
                <div className="workspace-heading">
                  <div>
                    <span>{workspaceMeta[workspace].eyebrow}</span>
                    <h1>{workspaceMeta[workspace].label}</h1>
                    <p>
                      {workspace === 'scanner' && 'Odaberite historijski dokument ili prenesite vlastitu fotografiju za analizu.'}
                      {workspace === 'archive' && 'Pregledajte oblike, značenja i sačuvane varijante bosančičnih slova.'}
                      {workspace === 'trainer' && 'Provjerite uzorke zajednice prije nego što postanu dio modela.'}
                    </p>
                  </div>
                  <button className="workspace-heading__new" onClick={startNewConversation}>
                    <Plus size={17} /> Novi upit
                  </button>
                </div>

                {workspace === 'scanner' && (
                  <ScanWorkflow
                    onScanCompleted={(newScan) => setScansHistory((current) => [newScan, ...current])}
                    scansHistory={scansHistory}
                  />
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
