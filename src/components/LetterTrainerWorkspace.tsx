import { useState } from 'react';
import { Archive, Cpu } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import LetterArchive from './LetterArchive';
import ModelTrainingPanel from './ModelTrainingPanel';
import Button from './ui/Button';

export default function LetterTrainerWorkspace() {
  const [section, setSection] = useState<'training' | 'archive'>('training');

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="relative mb-5 flex w-full max-w-xl overflow-hidden rounded-xl border border-[#2A2A2A] bg-[#0A0A0A]">
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-[11px] bg-[#C5A059]"
          animate={{ x: section === 'training' ? '0%' : '100%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        />
        <Button
          onClick={() => setSection('training')}
          aria-pressed={section === 'training'}
          style={{ outline: 'none', boxShadow: 'none' }}
          className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-[11px] border-0 bg-transparent px-4 py-3 text-xs transition-colors duration-300 ${section === 'training' ? 'text-black' : 'text-stone-400 hover:text-stone-200'}`}
        >
          <span className="flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Treniranje modela
          </span>
        </Button>
        <Button
          onClick={() => setSection('archive')}
          aria-pressed={section === 'archive'}
          style={{ outline: 'none', boxShadow: 'none' }}
          className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-[11px] border-0 bg-transparent px-4 py-3 text-xs transition-colors duration-300 ${section === 'archive' ? 'text-black' : 'text-stone-400 hover:text-stone-200'}`}
        >
          <span className="flex items-center gap-2">
            <Archive className="h-4 w-4" /> Arhiva slova
          </span>
        </Button>
      </div>
      <motion.div layout transition={{ layout: { duration: 0.28, ease: 'easeInOut' } }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {section === 'training' ? <ModelTrainingPanel /> : <LetterArchive />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
