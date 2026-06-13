import { useState } from 'react';
import { Role, ScanItem, ValidationSample } from './types';
import { MOCK_HISTORY, MOCK_VALIDATION_SAMPLES } from './data';
import RoleToggle from './components/RoleToggle';
import ScanWorkflow from './components/ScanWorkflow';
import LetterArchive from './components/LetterArchive';
import TrainerDashboard from './components/TrainerDashboard';
import { AnimatePresence, motion } from 'motion/react';
import { Landmark, Compass, History, HelpCircle, GraduationCap } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<Role>('korisnik');
  const [activeTab, setActiveTab] = useState<'skener' | 'abeceda'>('skener');
  const [scansHistory, setScansHistory] = useState<ScanItem[]>(MOCK_HISTORY);
  const [validationQueue, setValidationQueue] = useState<ValidationSample[]>(MOCK_VALIDATION_SAMPLES);

  const handleScanCompleted = (newScan: ScanItem) => {
    setScansHistory((prev) => [newScan, ...prev]);
  };

  const handleAddTrainingSample = (newSample: ValidationSample) => {
    setValidationQueue((prev) => [newSample, ...prev]);
  };

  const handleApproveSample = (id: string) => {
    setValidationQueue((prev) => prev.filter((item) => item.id !== id));
    // Simulate updating character examples
  };

  const handleRejectSample = (id: string) => {
    setValidationQueue((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0] font-sans selection:bg-gold/30 selection:text-[#E0E0E0] flex flex-col border-4 sm:border-8 border-[#1A1A1A]">
      {/* BACKGROUND TEXTURE FOR MUSEUM EXPERIENTIAL DESIGN */}
      <div className="absolute inset-0 pointer-events-none opacity-5 mix-blend-overlay bg-[radial-gradient(#C5A059_1px,transparent_1px)] [background-size:24px_24px] z-0"></div>

      {/* TOP HEADER PRE-BANNER */}
      <header className="z-10 border-b border-[#2A2A2A] bg-[#0A0A0A] sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-[#1A1A1A] border border-[#C5A059] flex items-center justify-center text-[#C5A059] font-serif font-black text-lg shadow-[0_0_10px_rgba(197,160,89,0.15)]">
              Б
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-[#C5A059] tracking-wider text-base uppercase">
                  bosančica.ai
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#1C1917] text-[#FF5F1F] border border-[#FF5F1F]/20 text-[8px] font-mono uppercase tracking-widest font-black">
                  PROJEKAT 1189
                </span>
              </div>
              <p className="text-[10px] text-stone-500 font-mono">Arheološka AI laboratorija BiH</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-6 text-xs text-stone-400 font-medium">
            <a href="#skener" className="hover:text-[#C5A059] transition-colors flex items-center gap-1">
              <span>Naučni rad</span>
            </a>
            <a href="#abeceda" className="hover:text-[#C5A059] transition-colors flex items-center gap-1">
              <span>Kraken OCR v1.4</span>
            </a>
            <span className="text-stone-700">|</span>
            <div className="flex items-center gap-1.5 font-mono text-stone-500">
              <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>Online čvorište</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative flex flex-col gap-6">
        {/* UPPER STATUS SUMMARY AND ROLE SELECTION */}
        <RoleToggle currentRole={role} onChange={setRole} />

        {/* CUSTOMER (KORISNIK) WORKSPACE WITH NESTED NAVIGATION */}
        <AnimatePresence mode="wait">
          {role === 'korisnik' ? (
            <motion.div
              key="korisnik-dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6"
            >
              {/* SUB HEADER TABS */}
              <div className="flex border-b border-[#2A2A2A] pb-px">
                <button
                  id="tab-skener"
                  onClick={() => setActiveTab('skener')}
                  className={`flex items-center gap-2 px-6 py-3.5 text-sm font-serif font-medium border-b-2 transition-all relative cursor-pointer ${
                    activeTab === 'skener'
                      ? 'border-[#C5A059] text-stone-100'
                      : 'border-transparent text-stone-400 hover:text-[#C5A059]'
                  }`}
                >
                  <Compass className="w-4 h-4 text-[#C5A059]" />
                  <span>Skeniranje & Transkripcija</span>
                  {activeTab === 'skener' && (
                    <motion.div
                      layoutId="activeTabUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C5A059]"
                    />
                  )}
                </button>

                <button
                  id="tab-abeceda"
                  onClick={() => setActiveTab('abeceda')}
                  className={`flex items-center gap-2 px-6 py-3.5 text-sm font-serif font-medium border-b-2 transition-all relative cursor-pointer ${
                    activeTab === 'abeceda'
                      ? 'border-[#C5A059] text-stone-100'
                      : 'border-transparent text-stone-400 hover:text-[#C5A059]'
                  }`}
                >
                  <GraduationCap className="w-4.5 h-4.5 text-[#C5A059]" />
                  <span>Arhiv i Treniranje Slova</span>
                  {activeTab === 'abeceda' && (
                    <motion.div
                      layoutId="activeTabUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C5A059]"
                    />
                  )}
                </button>
              </div>

              {/* ACTIVE SUBSCENE */}
              <div className="mt-2">
                {activeTab === 'skener' ? (
                  <ScanWorkflow
                    onScanCompleted={handleScanCompleted}
                    scansHistory={scansHistory}
                  />
                ) : (
                  <LetterArchive onAddTrainingSample={handleAddTrainingSample} />
                )}
              </div>
            </motion.div>
          ) : (
            /* TRAINER WORKSPACE */
            <motion.div
              key="trainer-dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <TrainerDashboard
                validationQueue={validationQueue}
                onApproveSample={handleApproveSample}
                onRejectSample={handleRejectSample}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="mt-12 border-t border-[#2A2A2A] bg-[#0A0A0A] py-8 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-stone-500">
          <div className="flex items-center gap-3">
            <Landmark className="w-5 h-5 text-[#C5A059]" />
            <div className="text-left">
              <p className="font-serif font-bold text-stone-400">bosančica.ai</p>
              <p className="text-[10px] mt-0.5">Tehnološka inicijativa očuvanja bosanskog kulturnog naslijeđa</p>
            </div>
          </div>

          <div className="flex gap-6 font-mono text-[10px] text-stone-600">
            <span>KONVERTER PISAMA V1.5</span>
            <span>KRAKEN ENGINE • 2026</span>
            <span>BEZ KOMERCIJALNE UPOTREBE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
