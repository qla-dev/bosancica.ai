import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Combine,
  Eye,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  SplitSquareVertical,
  Terminal,
} from 'lucide-react';
import { toBosancicaFontInput } from '../bosancica';
import {
  getSegmentationSettings,
  type SegmentationRepairSettings,
  updateSegmentationSettings,
} from '../api/settings';
import Button from './ui/Button';
import PrimaryButton from './ui/PrimaryButton';

const FALLBACK_SETTINGS: SegmentationRepairSettings = {
  enabled: true,
  trigger_multiplier: 1.3,
  valley_threshold_ratio: 0.18,
  min_valley_width: 2,
  min_segment_height_ratio: 0.60,
  edge_guard_ratio: 0.08,
  merge_overlap_ratio: 0.65,
  merge_width_ratio: 0.35,
  merge_short_height_ratio: 0.75,
  merge_min_height_ratio: 1.65,
  merge_max_height_ratio: 2.15,
};

type CollapsibleGroupProps = {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string;
};

function CollapsibleGroup({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  badge,
}: CollapsibleGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#0F0F0F] shadow-xl">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#151513]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#3A3429] bg-[#1B1812] text-[#C5A059]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-sm font-bold text-stone-100">{title}</span>
            {badge && (
              <span className="rounded-full border border-[#4A402D] bg-[#211C13] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#C5A059]">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-[#2A2A2A] px-5 py-5">
          {children}
        </div>
      )}
    </section>
  );
}

type NumericControlProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
};

function NumericControl({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  suffix,
}: NumericControlProps) {
  const update = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(Math.max(min, Math.min(max, nextValue)));
  };

  return (
    <label className={`block rounded-xl border border-[#252525] bg-[#0A0A0A] p-4 ${disabled ? 'opacity-45' : ''}`}>
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-xs font-semibold text-stone-200">{label}</span>
          <span className="mt-1 block max-w-2xl text-[10px] leading-4 text-stone-500">{description}</span>
        </span>
        <span className="flex shrink-0 items-center rounded-lg border border-[#35322D] bg-[#171613]">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(event) => update(Number(event.target.value))}
            className="h-9 w-20 border-0 bg-transparent px-2 text-right font-mono text-xs font-bold text-[#D3AF65] outline-none"
          />
          {suffix && <span className="pr-2 text-[10px] text-stone-600">{suffix}</span>}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => update(Number(event.target.value))}
        className="mt-4 h-1 w-full accent-[#C5A059]"
      />
      <span className="mt-2 flex justify-between font-mono text-[9px] text-stone-700">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}

export default function TrainerDashboard() {
  const [threshold, setThreshold] = useState(128);
  const [minWordLength, setMinWordLength] = useState(15);
  const [dilationCycles, setDilationCycles] = useState(3);
  const [settings, setSettings] = useState<SegmentationRepairSettings>(FALLBACK_SETTINGS);
  const [defaults, setDefaults] = useState<SegmentationRepairSettings>(FALLBACK_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<SegmentationRepairSettings>(FALLBACK_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState<string[]>([
    'Sistem spreman: model bosancica_neural_v1.4.bin učitan.',
    'Svi Kraken alati dostupni u sandbox okruženju.',
  ]);

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [savedSettings, settings],
  );

  useEffect(() => {
    let active = true;

    getSegmentationSettings()
      .then((response) => {
        if (!active) return;
        setSettings(response.data);
        setSavedSettings(response.data);
        setDefaults(response.defaults);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Postavke segmentacije nije moguće učitati.',
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const setRepairSetting = <Key extends keyof SegmentationRepairSettings>(
    key: Key,
    value: SegmentationRepairSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const saveSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await updateSegmentationSettings(settings);
      setSettings(response.data);
      setSavedSettings(response.data);
      setDefaults(response.defaults);
      setMessage({
        type: 'success',
        text: 'Postavke su sačuvane i primijenit će se na sljedeću segmentaciju.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Postavke nije moguće sačuvati.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const startMockTraining = () => {
    if (isTraining) return;
    setIsTraining(true);
    setTrainingLogs([
      '[KRAKEN-ENGINE] Pokrećem analizu novih uzoraka...',
      'Inicijalizacija neuronske mreže: ResNet50 + Transformer-CTC...',
      'Učitavanje validiranih klesanih ligatura...',
    ]);

    let step = 0;
    const logs = [
      '[DATA-PREP] Učitana 1,385 verifikovana uzorka.',
      '[EPOCH 1/5] Loss: 0.1245 | Tačnost: 94.2% | Vrijeme: 450ms',
      '[EPOCH 2/5] Loss: 0.0894 | Tačnost: 95.8% | Vrijeme: 421ms',
      '[EPOCH 3/5] Loss: 0.0612 | Tačnost: 96.5% | Vrijeme: 433ms',
      '[EPOCH 4/5] Loss: 0.0388 | Tačnost: 97.1% | Vrijeme: 460ms',
      '[EPOCH 5/5] Loss: 0.0195 | Tačnost: 98.2% | Vrijeme: 412ms',
      '[TRENING] Uspješno konvergirano! Novi model spremljen.',
      '[KRAKEN-ENG] bosancica_neural_v1.5.bin uspješno spremljen u oblak.',
    ];

    const timer = window.setInterval(() => {
      if (step < logs.length) {
        setTrainingLogs((current) => [...current, logs[step]]);
        step += 1;
      } else {
        window.clearInterval(timer);
        setIsTraining(false);
      }
    }, 600);
  };

  const repairDisabled = isLoading || !settings.enabled;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-stone-200">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#2A2A2A] bg-[#111110] p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-[#C5A059]" />
            <h2 className="font-serif text-base font-bold text-stone-100">Konfiguracija segmentacije</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Sačuvane vrijednosti se šalju Kraken 2 servisu i koriste u završnoj backend popravci.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSettings(defaults);
              setMessage(null);
            }}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Vrati zadano
          </Button>
          <PrimaryButton
            size="sm"
            onClick={saveSettings}
            disabled={isLoading || isSaving || !isDirty}
            className="px-4"
          >
            {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {isSaving ? 'Spremanje...' : 'Sačuvaj postavke'}
          </PrimaryButton>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
            message.type === 'success'
              ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300'
              : 'border-red-900/70 bg-red-950/30 text-red-300'
          }`}
        >
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <CollapsibleGroup
        title="Binarizacija i vizuelni pregled"
        description="Lokalni pregled kontrasta i spajanja poteza prije obrade dokumenta."
        icon={<Eye className="h-5 w-5" />}
        defaultOpen
        badge="pregled"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="grid gap-4">
            <NumericControl
              label="Prag binarnosti"
              description="Mijenja kontrast u vizuelnom pregledu starog dokumenta."
              value={threshold}
              min={50}
              max={200}
              step={1}
              onChange={setThreshold}
              suffix="/255"
            />
            <NumericControl
              label="Minimalna širina riječi"
              description="Simulira ignorisanje sitnih pukotina koje mogu izgledati kao znakovi."
              value={minWordLength}
              min={5}
              max={40}
              step={1}
              onChange={setMinWordLength}
              suffix="px"
            />
            <NumericControl
              label="Ciklusi dilacije"
              description="Simulira spajanje isprekidanih poteza na oštećenim površinama."
              value={dilationCycles}
              min={1}
              max={8}
              step={1}
              onChange={setDilationCycles}
            />
          </div>

          <div className="flex min-h-64 items-center justify-center rounded-xl border border-[#252525] bg-black p-6">
            <div className="relative text-center transition-all duration-150">
              <p
                style={{
                  filter: `contrast(${threshold / 100}) grayscale(1)`,
                  letterSpacing: `${dilationCycles * 1.5}px`,
                }}
                className="font-bosanko select-none text-4xl font-normal text-[#C5A059]"
              >
                {toBosancicaFontInput('U ime oca i sina')}
              </p>
              <div
                style={{ opacity: minWordLength > 20 ? 0.3 : 1 }}
                className="pointer-events-none absolute -inset-3 rounded border border-[#C5A059]/40 transition-opacity"
              >
                <span className="absolute left-1 top-0 border border-[#2A2A2A] bg-black px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-[#C5A059]">
                  KRAKEN-BOX
                </span>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Razdvajanje spojenih redova"
        description="Kontroliše kada density repair prepoznaje previsok red i gdje ga smije presjeći."
        icon={<SplitSquareVertical className="h-5 w-5" />}
        defaultOpen
        badge="backend + kraken 2"
      >
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[#343029] bg-[#17140F] p-4">
          <div>
            <div className="text-xs font-semibold text-stone-200">Density repair</div>
            <div className="mt-1 text-[10px] text-stone-500">
              Isključivanje preskače i razdvajanje redova i spajanje fragmenata.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="min-w-14 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {settings.enabled ? 'Uključeno' : 'Isključeno'}
            </span>
            <button
              type="button"
              role="switch"
              aria-label="Uključi ili isključi density repair"
              aria-checked={settings.enabled}
              disabled={isLoading}
              onClick={() => setRepairSetting('enabled', !settings.enabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors ${
                settings.enabled
                  ? 'border-[#8E713D] bg-[#C5A059]'
                  : 'border-[#3B3B38] bg-[#20201E]'
              }`}
            >
              <span
                className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <NumericControl
            label="Prag visine reda"
            description="Red viši od medijana × ove vrijednosti ulazi u analizu za razdvajanje."
            value={settings.trigger_multiplier}
            min={1}
            max={5}
            step={0.05}
            onChange={(value) => setRepairSetting('trigger_multiplier', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Minimalna visina dijela"
            description="Najmanja dozvoljena visina novog reda u odnosu na medijan. Vrijednost 0.60 razdvaja zbijene redove bez prihvatanja vrlo sitnih dijelova."
            value={settings.min_segment_height_ratio}
            min={0.05}
            max={2}
            step={0.05}
            onChange={(value) => setRepairSetting('min_segment_height_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Prag gustoće doline"
            description="Veća vrijednost prihvata više praznih zona kao moguću granicu između redova."
            value={settings.valley_threshold_ratio}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setRepairSetting('valley_threshold_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Minimalna širina doline"
            description="Koliko uzastopnih redova piksela mora činiti praznu zonu."
            value={settings.min_valley_width}
            min={1}
            max={20}
            step={1}
            onChange={(value) => setRepairSetting('min_valley_width', Math.round(value))}
            disabled={repairDisabled}
            suffix="px"
          />
          <NumericControl
            label="Zaštita rubova"
            description="Dio gornjeg i donjeg ruba kandidata u kojem se rezovi ignorišu."
            value={settings.edge_guard_ratio}
            min={0}
            max={0.4}
            step={0.01}
            onChange={(value) => setRepairSetting('edge_guard_ratio', value)}
            disabled={repairDisabled}
          />
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Spajanje preklopljenih fragmenata"
        description="Konzervativno vraća fragmente istog reda koje je segmentator pogrešno razdvojio."
        icon={<Combine className="h-5 w-5" />}
        defaultOpen
        badge="novi omjeri"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <NumericControl
            label="Minimalno vertikalno preklapanje"
            description="Najmanji udio preklapanja visine potreban da bi dva fragmenta bila kandidat za spajanje."
            value={settings.merge_overlap_ratio}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setRepairSetting('merge_overlap_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Sličnost širine fragmenata"
            description="Odnos uže i šire kutije. Veća vrijednost zahtijeva sličnije širine."
            value={settings.merge_width_ratio}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setRepairSetting('merge_width_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Prag kratkog fragmenta"
            description="Fragment ispod medijana × ove vrijednosti smatra se dovoljno kratkim za spajanje."
            value={settings.merge_short_height_ratio}
            min={0}
            max={3}
            step={0.05}
            onChange={(value) => setRepairSetting('merge_short_height_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Minimalna spojena visina"
            description="Alternativni uslov: ukupna visina para mora biti najmanje medijan × ova vrijednost."
            value={settings.merge_min_height_ratio}
            min={0}
            max={5}
            step={0.05}
            onChange={(value) => setRepairSetting('merge_min_height_ratio', value)}
            disabled={repairDisabled}
          />
          <NumericControl
            label="Maksimalna spojena visina"
            description="Sigurnosna granica koja sprečava spajanje fragmenata u previsok blok."
            value={settings.merge_max_height_ratio}
            min={1}
            max={6}
            step={0.05}
            onChange={(value) => setRepairSetting('merge_max_height_ratio', value)}
            disabled={repairDisabled}
          />
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Pogon za treniranje neuralnog modela"
        description="Konzola za fino podešavanje OCR modela nad validiranim uzorcima."
        icon={<Terminal className="h-5 w-5" />}
      >
        <div className="flex items-center justify-end pb-4">
          <PrimaryButton onClick={startMockTraining} disabled={isTraining} className="px-4 py-2">
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>{isTraining ? 'Fino učenje...' : 'Treniraj model'}</span>
          </PrimaryButton>
        </div>
        <div className="max-h-72 min-h-48 overflow-y-auto rounded-xl border border-[#2A2A2A] bg-black p-4 font-mono text-xs shadow-inner">
          {trainingLogs.map((log, index) => (
            <div
              key={`${index}-${log}`}
              className={`py-0.5 ${
                log.startsWith('[EPOCH')
                  ? 'text-[#C5A059]'
                  : log.startsWith('[TRENING') || log.startsWith('[KRAKEN-ENG')
                    ? 'font-bold text-emerald-400'
                    : 'text-stone-400'
              }`}
            >
              {log}
            </div>
          ))}
          {isTraining && (
            <div className="mt-1 animate-pulse text-[#C5A059]">▹ Optimizacija matrica u toku...</div>
          )}
        </div>
      </CollapsibleGroup>
    </div>
  );
}
