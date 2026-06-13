import { Role } from '../types';
import { ShieldAlert, User, Landmark } from 'lucide-react';

interface RoleToggleProps {
  currentRole: Role;
  onChange: (role: Role) => void;
}

export default function RoleToggle({ currentRole, onChange }: RoleToggleProps) {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] mb-8 shadow-2xl relative overflow-hidden">
      {/* Decorative Corner Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A059]/5 rounded-full blur-2xl pointer-events-none"></div>
      
      <div className="flex items-center gap-3.5 z-10">
        <div className="p-3 rounded-lg bg-[#1A1A1A] border border-[#C5A059]/30 text-[#C5A059] shadow-inner">
          <Landmark className="w-5 h-5 animate-pulse" id="header-landmark-icon" />
        </div>
        <div>
          <h2 className="text-xl font-serif font-bold text-stone-100 tracking-wider">
            bosančica.ai
          </h2>
          <p className="text-xs text-stone-400">
            Sveobuhvatna AI laboratorija za digitalnu restauraciju starobosanskog pisma
          </p>
        </div>
      </div>

      <div className="flex bg-[#0A0A0A] p-1.5 rounded-xl border border-[#2A2A2A] self-stretch md:self-auto z-10">
        <button
          id="btn-role-korisnik"
          onClick={() => onChange('korisnik')}
          className={`flex-1 md:flex-initial flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
            currentRole === 'korisnik'
              ? 'bg-[#C5A059] text-black shadow-lg font-bold border border-[#D4B069]/40'
              : 'text-stone-400 hover:text-stone-200 hover:bg-[#1A1A1A]'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Istraživač / Korisnik</span>
        </button>

        <button
          id="btn-role-trener"
          onClick={() => onChange('trener')}
          className={`flex-1 md:flex-initial flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
            currentRole === 'trener'
              ? 'bg-[#FF5F1F] text-stone-100 shadow-lg shadow-orange-950/40 border border-[#FF5F1F]/40 font-bold animate-pulse'
              : 'text-stone-400 hover:text-stone-200 hover:bg-[#1A1A1A]'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>AI Trener / Nadzor</span>
        </button>
      </div>
    </div>
  );
}
