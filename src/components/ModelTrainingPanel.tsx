import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Cpu,
  Database,
  Download,
  Equal,
  ExternalLink,
  FileArchive,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  cancelTraining,
  getEscriptoriumStatus,
  getTrainingArtifactUrl,
  listTrainingDatasets,
  listTrainingJobs,
  listTrainingModels,
  startTraining,
  uploadTrainingDataset,
  type EscriptoriumStatus,
  type TrainingDataset,
  type TrainingJob,
  type TrainingModel,
} from '../api/training';
import Button from './ui/Button';
import PrimaryButton from './ui/PrimaryButton';

const activeStatuses = new Set(['pending', 'running', 'cancelling']);
const terminalStatuses = new Set(['cancelled', 'completed', 'failed', 'interrupted']);
const statusLabels: Record<string, string> = {
  pending: 'Čeka pokretanje',
  running: 'Trening u toku',
  cancelling: 'Zaustavljanje',
  cancelled: 'Zaustavljeno',
  completed: 'Završeno',
  failed: 'Neuspješno',
  interrupted: 'Prekinuto',
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const qualityLabels = {
  good: 'Dobar rezultat',
  usable: 'Potrebna provjera',
  poor: 'Slab rezultat',
};

type AdvancedForm = {
  targetCer: string;
  patience: string;
  minEpochs: string;
  minDelta: string;
  optimizer: string;
  learningRate: string;
  batchSize: string;
  weightDecay: string;
  momentum: string;
  gradientClip: string;
  accumulate: string;
  warmup: string;
  freezeBackbone: string;
  validationFrequency: string;
  schedule: string;
  gamma: string;
  stepSize: string;
  schedulerPatience: string;
  cosineMaxEpochs: string;
  cosineMinLr: string;
  logger: string;
  additionalArgs: string;
};

const emptyAdvancedForm: AdvancedForm = {
  targetCer: '', patience: '', minEpochs: '', minDelta: '', optimizer: '', learningRate: '',
  batchSize: '', weightDecay: '', momentum: '', gradientClip: '', accumulate: '', warmup: '',
  freezeBackbone: '', validationFrequency: '', schedule: '', gamma: '', stepSize: '',
  schedulerPatience: '', cosineMaxEpochs: '', cosineMinLr: '', logger: '', additionalArgs: '',
};

const optionalNumber = (value: string) => value.trim() === '' ? null : Number(value);

const fallbackProgress = (job: TrainingJob) => {
  if (job.status === 'completed') {
    return {
      phase: 'completed', label: 'Trening je završen', percent: 100,
      current_epoch: job.completed_epochs ?? job.epochs, total_epochs: job.epochs, indeterminate: false,
    };
  }
  if (['failed', 'cancelled', 'interrupted'].includes(job.status)) {
    const label = job.status === 'failed' ? 'Trening nije uspio'
      : job.status === 'cancelled' ? 'Trening je zaustavljen' : 'Trening je prekinut';
    return {
      phase: job.status, label, percent: null,
      current_epoch: null, total_epochs: job.epochs, indeterminate: false,
    };
  }
  const output = job.logs?.join('\n') ?? '';
  const batchStages = [...output.matchAll(/stage\s+(\d+)\s*\/\s*([^\s]+)[^\r\n]*?\b(\d+)\s*\/\s*(\d+)\b/gi)];
  const lastBatch = batchStages.at(-1);
  if (lastBatch) {
    const epochIndex = Number(lastBatch[1]);
    const currentBatch = Number(lastBatch[3]);
    const totalBatches = Number(lastBatch[4]);
    if (totalBatches > 0 && currentBatch < totalBatches) {
      const epochFraction = currentBatch / totalBatches;
      const overallFraction = Math.min(1, (epochIndex + epochFraction) / job.epochs);
      return {
        phase: 'training',
        label: `Epoha ${epochIndex + 1} / ${job.epochs} · batch ${currentBatch} / ${totalBatches}`,
        percent: Math.min(94, Math.round(5 + 85 * overallFraction)),
        current_epoch: epochIndex + 1,
        total_epochs: job.epochs,
        current_batch: currentBatch,
        total_batches: totalBatches,
        epoch_percent: Math.round(epochFraction * 1000) / 10,
        indeterminate: false,
      };
    }
  }
  const stages = [...output.matchAll(/stage\s+(\d+)\s*\/\s*(\d+|∞|âˆž)/gi)];
  const lastStage = stages.at(-1);
  if (lastStage) {
    const current = Number(lastStage[1]) + 1;
    const total = /^\d+$/.test(lastStage[2]) ? Number(lastStage[2]) + 1 : job.epochs;
    if (current > job.epochs) {
      return {
        phase: 'overrun',
        label: `Kraken je prekoračio zadani broj epoha (${current} / ${job.epochs})`,
        percent: 95,
        current_epoch: current,
        total_epochs: job.epochs,
        indeterminate: false,
      };
    }
    const boundedCurrent = Math.min(current, total);
    return {
      phase: 'validating',
      label: `Epoha ${boundedCurrent} je istrenirana · validacija i spremanje modela`,
      percent: Math.min(95, Math.round(15 + (75 * boundedCurrent) / total)),
      current_epoch: boundedCurrent,
      total_epochs: total,
      indeterminate: false,
    };
  }
  if (/starting training|trainable params|gpu available/i.test(output)) {
    return {
      phase: 'training', label: 'Kraken trenira model', percent: null,
      current_epoch: null, total_epochs: job.epochs, indeterminate: true,
    };
  }
  return {
    phase: 'preparing', label: 'Priprema podataka i modela', percent: null,
    current_epoch: null, total_epochs: job.epochs, indeterminate: true,
  };
};

const normalizeConsoleLogs = (logs: string[]) => {
  const markerIndex = logs.indexOf('--- Kraken izlaz ---');
  if (markerIndex < 0) return logs;
  const beforeKraken = logs.slice(0, markerIndex);
  const trainingStart = beforeKraken.findIndex((line) => line.includes('Starting training. Log:'));
  const preamble = trainingStart >= 0 ? beforeKraken.slice(0, trainingStart + 1) : beforeKraken;
  return [...preamble, logs[markerIndex], ...logs.slice(markerIndex + 1)];
};

const appendedLogLines = (previous: string[], next: string[]) => {
  const maximumOverlap = Math.min(previous.length, next.length);
  for (let size = maximumOverlap; size > 0; size -= 1) {
    if (previous.slice(-size).every((line, index) => line === next[index])) return next.slice(size);
  }
  return next;
};

type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

function ThemedSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-xs outline-none transition-colors ${
          open
            ? 'border-[#C5A059] bg-[#14120E] shadow-[0_0_0_3px_rgba(197,160,89,0.08)]'
            : 'border-[#343434] bg-[#0A0A0A] hover:border-[#5A4A2D]'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <span className="min-w-0 truncate font-medium text-stone-200">
          {selected?.label ?? 'Odaberite vrijednost'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#C5A059] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-[#4A402D] bg-[#11100D] p-1.5 shadow-2xl shadow-black/70"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                option.value === value
                  ? 'bg-[#2A251A] text-[#E1C47E]'
                  : 'text-stone-300 hover:bg-[#1B1812] hover:text-stone-100'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{option.label}</span>
                {option.description && <span className="mt-0.5 block truncate text-[10px] text-stone-500">{option.description}</span>}
              </span>
              {option.value === value && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#C5A059]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelTrainingPanel() {
  const [datasets, setDatasets] = useState<TrainingDataset[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [models, setModels] = useState<TrainingModel[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [runName, setRunName] = useState(`bosancica-ocr-${new Date().toISOString().slice(0, 10)}`);
  const [mode, setMode] = useState<'finetune' | 'scratch'>('finetune');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [epochs, setEpochs] = useState(30);
  const [augment, setAugment] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [advancedForm, setAdvancedForm] = useState<AdvancedForm>(emptyAdvancedForm);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [escriptorium, setEscriptorium] = useState<EscriptoriumStatus | null>(null);
  const [showZipHelp, setShowZipHelp] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(224);
  const [copied, setCopied] = useState(false);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLPreElement>(null);
  const consoleJobIdRef = useRef<string | null>(null);
  const lastServerLogsRef = useRef<string[]>([]);
  const followConsoleRef = useRef(true);
  const consoleResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const previousJobStateRef = useRef<{ id: string; status: string } | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextDatasets, nextModels, nextJobs, nextEscriptorium] = await Promise.all([
        listTrainingDatasets(), listTrainingModels(), listTrainingJobs(), getEscriptoriumStatus(),
      ]);
      setDatasets(nextDatasets);
      setModels(nextModels);
      setJobs(nextJobs);
      setEscriptorium(nextEscriptorium);
      setSelectedDatasetId((current) => (
        nextDatasets.some((dataset) => dataset.id === current && dataset.report.valid)
          ? current
          : nextDatasets.find((dataset) => dataset.report.valid)?.id ?? ''
      ));
      setSelectedModelId((current) => (
        nextModels.some((model) => model.id === current)
          ? current
          : nextModels.find((model) => model.default)?.id ?? nextModels[0]?.id ?? ''
      ));
    } catch (error) {
      if (!quiet) setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Podaci za treniranje nisu dostupni.',
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await listTrainingJobs());
    } catch {
      // Keep the last known state during a transient polling failure.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveJob = jobs.some((job) => activeStatuses.has(job.status));
  const activeJob = jobs.find((job) => activeStatuses.has(job.status));
  const trackedJob = activeJob ?? jobs[0];
  const trackedProgress = trackedJob ? fallbackProgress(trackedJob) : null;
  const elapsedSeconds = trackedJob
    ? activeJob?.id === trackedJob.id
      ? Math.max(0, (clock - Date.parse(trackedJob.started_at ?? trackedJob.created_at)) / 1000)
      : trackedJob.elapsed_seconds ?? Math.max(0, (Date.parse(trackedJob.finished_at ?? trackedJob.created_at) - Date.parse(trackedJob.started_at ?? trackedJob.created_at)) / 1000)
    : 0;
  useEffect(() => {
    if (!hasActiveJob) return undefined;
    const timer = window.setInterval(() => void refreshJobs(), 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveJob, refreshJobs]);

  useEffect(() => {
    if (!activeJob) return undefined;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeJob?.id]);

  useEffect(() => {
    if (!trackedJob) return;
    const previous = previousJobStateRef.current;
    if (previous?.id === trackedJob.id && activeStatuses.has(previous.status) && terminalStatuses.has(trackedJob.status)) {
      if (trackedJob.status === 'completed') {
        setMessage({ type: 'success', text: 'Trening je završen. Ukupno vrijeme je zaustavljeno i model je spreman za provjeru.' });
      } else if (trackedJob.status === 'failed') {
        setMessage({ type: 'error', text: trackedJob.error_message || 'Trening je završen greškom.' });
      }
    }
    previousJobStateRef.current = { id: trackedJob.id, status: trackedJob.status };
  }, [trackedJob?.id, trackedJob?.status, trackedJob?.error_message]);

  useEffect(() => {
    if (!trackedJob) {
      setConsoleLines([]);
      consoleJobIdRef.current = null;
      lastServerLogsRef.current = [];
      return;
    }

    const incoming = normalizeConsoleLogs(trackedJob.logs ?? []);
    const changedJob = consoleJobIdRef.current !== trackedJob.id;
    const additions = changedJob ? incoming : appendedLogLines(lastServerLogsRef.current, incoming);
    consoleJobIdRef.current = trackedJob.id;
    lastServerLogsRef.current = incoming;
    if (changedJob) {
      followConsoleRef.current = true;
      setConsoleLines(incoming);
    } else if (additions.length > 0) {
      setConsoleLines((current) => [...current, ...additions].slice(-1000));
    }

    if ((changedJob || additions.length > 0) && followConsoleRef.current) {
      window.requestAnimationFrame(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      });
    }
  }, [trackedJob]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId],
  );
  const datasetOptions = useMemo<SelectOption[]>(() => (
    datasets.length === 0
      ? [{ value: '', label: 'Nema validnih skupova', disabled: true }]
      : datasets.map((dataset) => ({
          value: dataset.id,
          label: `${dataset.name} · ${dataset.source === 'local' ? 'projekt' : 'ZIP'}`,
          description: dataset.report.valid
            ? `${dataset.report.train_samples} trening · ${dataset.report.validation_samples} validacija`
            : 'Skup nije prošao validaciju',
          disabled: !dataset.report.valid,
        }))
  ), [datasets]);
  const modelOptions = useMemo<SelectOption[]>(() => (
    models.length === 0
      ? [{ value: '', label: 'Nema dostupnih Kraken modela', disabled: true }]
      : models.map((model) => ({
          value: model.id,
          label: model.name,
          description: `${model.description} · ${formatBytes(model.size_bytes)}${model.default ? ' · zadani' : ''}`,
        }))
  ), [models]);

  useEffect(() => {
    if (!showZipHelp) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowZipHelp(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showZipHelp]);

  const uploadDataset = async () => {
    if (!zipFile || uploading) return;
    setUploading(true);
    setMessage(null);
    try {
      const dataset = await uploadTrainingDataset(zipFile, uploadName);
      await refresh(true);
      setSelectedDatasetId(dataset.id);
      setZipFile(null);
      setUploadName('');
      setMessage({ type: 'success', text: 'ZIP je validiran i dodat kao novi trening batch.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'ZIP nije moguće učitati.' });
    } finally {
      setUploading(false);
    }
  };

  const beginTraining = async () => {
    if (!selectedDataset || submitting || hasActiveJob) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await startTraining({
        dataset_id: selectedDataset.id,
        name: runName.trim(),
        mode,
        epochs,
        augment,
        base_model_id: mode === 'finetune' ? selectedModelId : null,
        advanced,
        ...(advanced ? {
          target_cer: advancedForm.targetCer === '' ? null : optionalNumber(advancedForm.targetCer) / 100,
          early_stopping_patience: optionalNumber(advancedForm.patience),
          min_epochs: optionalNumber(advancedForm.minEpochs),
          min_delta: advancedForm.minDelta === '' ? null : optionalNumber(advancedForm.minDelta) / 100,
          optimizer: advancedForm.optimizer || null,
          learning_rate: optionalNumber(advancedForm.learningRate),
          batch_size: optionalNumber(advancedForm.batchSize),
          weight_decay: optionalNumber(advancedForm.weightDecay),
          momentum: optionalNumber(advancedForm.momentum),
          gradient_clip: optionalNumber(advancedForm.gradientClip),
          accumulate_grad_batches: optionalNumber(advancedForm.accumulate),
          warmup: optionalNumber(advancedForm.warmup),
          freeze_backbone: optionalNumber(advancedForm.freezeBackbone),
          validation_frequency: optionalNumber(advancedForm.validationFrequency),
          schedule: advancedForm.schedule || null,
          gamma: optionalNumber(advancedForm.gamma),
          step_size: optionalNumber(advancedForm.stepSize),
          scheduler_patience: optionalNumber(advancedForm.schedulerPatience),
          cosine_max_epochs: optionalNumber(advancedForm.cosineMaxEpochs),
          cosine_min_lr: optionalNumber(advancedForm.cosineMinLr),
          logger: advancedForm.logger || null,
          additional_ketos_args: advancedForm.additionalArgs.trim() || null,
        } : {}),
      });
      await refresh(true);
      setMessage({ type: 'success', text: 'Trening je pokrenut. Ovu stranicu možete napustiti; posao ostaje aktivan.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Trening nije moguće pokrenuti.' });
    } finally {
      setSubmitting(false);
    }
  };

  const stopTraining = async (job: TrainingJob) => {
    setMessage(null);
    setStoppingJobId(job.id);
    try {
      await cancelTraining(job.id);
      await refresh(true);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Trening nije moguće zaustaviti.' });
    } finally {
      setStoppingJobId(null);
    }
  };

  const clearConsole = () => {
    setConsoleLines([]);
    lastServerLogsRef.current = normalizeConsoleLogs(trackedJob?.logs ?? []);
    followConsoleRef.current = true;
  };

  const copyConsole = async () => {
    if (consoleLines.length === 0) return;
    try {
      await navigator.clipboard.writeText(consoleLines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage({ type: 'error', text: 'Izlaz procesa nije moguće kopirati u međuspremnik.' });
    }
  };

  const resizeConsole = (clientY: number) => {
    const resize = consoleResizeRef.current;
    if (!resize) return;
    const maximumHeight = Math.max(224, Math.floor(window.innerHeight * 0.72));
    setConsoleHeight(Math.max(140, Math.min(maximumHeight, resize.startHeight + clientY - resize.startY)));
  };

  const updateAdvanced = (key: keyof AdvancedForm, value: string) => {
    setAdvancedForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-[#2A2A2A] bg-[#111110] p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#C5A059]">
              <Cpu className="h-5 w-5" />
              <h2 className="font-serif text-lg font-bold text-stone-100">Treniranje OCR modela</h2>
              <span className="rounded-full border border-emerald-900/70 bg-emerald-950/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-400">
                Podaci uživo
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-stone-500">
              Fino podesite Kraken model nad provjerenim slikama redova i njihovim transkriptima. Testni skup se ne koristi tokom treninga.
            </p>
          </div>
          <Button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Osvježi
          </Button>
        </div>

        {message && (
          <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
            message.type === 'success'
              ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300'
              : 'border-red-900/70 bg-red-950/30 text-red-300'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {trackedJob && trackedProgress && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-[#4A402D] bg-[#0A0A09] shadow-inner shadow-black/40">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#28251E] px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {activeJob
                    ? <Activity className="h-4 w-4 animate-pulse text-emerald-400" />
                    : trackedJob.status === 'completed'
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                  <h3 className="truncate text-sm font-semibold text-stone-100">{trackedJob.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                    activeJob ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-400' : 'border-[#4A402D] bg-[#211C13] text-[#D3AF65]'
                  }`}>
                    {activeJob ? 'Uživo' : statusLabels[trackedJob.status] ?? trackedJob.status}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-stone-500">
                  {trackedJob.dataset_name} · {trackedJob.mode === 'finetune' ? 'fino podešavanje' : 'od početka'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button onClick={clearConsole} disabled={consoleLines.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#181713] px-2.5 text-[10px] text-stone-400 hover:bg-[#242119] hover:text-stone-200 disabled:opacity-35">
                  <Trash2 className="h-3.5 w-3.5" /> Očisti
                </Button>
                <Button onClick={() => void copyConsole()} disabled={consoleLines.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#181713] px-2.5 text-[10px] text-stone-400 hover:bg-[#242119] hover:text-stone-200 disabled:opacity-35">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Kopirano' : 'Kopiraj'}
                </Button>
                {activeJob && (
                  <Button
                    onClick={() => void stopTraining(activeJob)}
                    disabled={stoppingJobId === activeJob.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-900/70 bg-red-950/20 px-2.5 text-[10px] font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {stoppingJobId === activeJob.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
                    {stoppingJobId === activeJob.id ? 'Zaustavljanje' : 'Zaustavi'}
                  </Button>
                )}
                <div className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 font-mono text-xs ${
                  trackedJob.status === 'completed'
                    ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-300'
                    : terminalStatuses.has(trackedJob.status)
                      ? 'border-red-900/60 bg-red-950/20 text-red-300'
                      : 'border-transparent bg-black/30 text-stone-300'
                }`}>
                  {trackedJob.status === 'completed'
                    ? <CheckCircle2 className="h-4 w-4" />
                    : terminalStatuses.has(trackedJob.status)
                      ? <AlertTriangle className="h-4 w-4" />
                      : <Clock3 className="h-4 w-4 text-[#C5A059]" />}
                  <span>{formatDuration(elapsedSeconds)}</span>
                  {terminalStatuses.has(trackedJob.status) && (
                    <span className="border-l border-current/20 pl-2 font-sans text-[9px] font-semibold uppercase tracking-wider">
                      {statusLabels[trackedJob.status] ?? trackedJob.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-4">
              {trackedJob.active_command && (
                <div className="rounded-xl border border-[#343127] bg-black/50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#C5A059]">
                    <Terminal className="h-3.5 w-3.5" /> {activeJob ? 'Trenutno se izvršava' : 'Naredba procesa'}
                  </div>
                  <code className="block overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-4 text-stone-300">
                    {trackedJob.active_command}
                  </code>
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-stone-200">{trackedProgress.label}</span>
                  <span className="text-stone-500">
                    {trackedProgress.current_batch && trackedProgress.total_batches
                      ? `Batch ${trackedProgress.current_batch} / ${trackedProgress.total_batches} · ${trackedProgress.epoch_percent}% epohe`
                      : trackedProgress.current_epoch
                      ? `Epoha ${trackedProgress.current_epoch} / ${trackedProgress.total_epochs}`
                      : `${trackedJob.epochs} ${trackedJob.epochs === 1 ? 'epoha' : 'epoha ukupno'}`}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-[#25231E]">
                  {trackedProgress.percent !== null ? (
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#A37F3D] to-[#E0BF72]"
                      initial={{ width: 0 }}
                      animate={{ width: `${trackedProgress.percent}%` }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  ) : trackedProgress.indeterminate ? (
                    <motion.div
                      className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#D3AF65] to-transparent"
                      animate={{ left: ['-35%', '105%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ) : <div className="h-full w-full rounded-full bg-stone-800" />}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-stone-500">
                  {trackedProgress.current_batch && trackedProgress.total_batches
                    ? `Obrađeno ${trackedProgress.current_batch} od ${trackedProgress.total_batches} trening primjera u trenutnoj epohi.`
                    : trackedProgress.indeterminate
                    ? 'Kraken trenutno ne prijavljuje pouzdan procenat, zato se prikazuje stvarna faza i proteklo vrijeme.'
                    : trackedProgress.percent !== null ? `${trackedProgress.percent}% završeno prema izlazu procesa.` : 'Prikazano je posljednje sačuvano stanje procesa.'}
                </p>
              </div>

              {trackedJob.stop_reason && (
                <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-300">
                  Rano zaustavljanje: {trackedJob.stop_reason}
                </p>
              )}

              {trackedJob.metrics && (
                <div className={`rounded-xl border p-4 ${
                  trackedJob.metrics.quality === 'good'
                    ? 'border-emerald-900/70 bg-emerald-950/20'
                    : trackedJob.metrics.quality === 'usable'
                      ? 'border-amber-900/70 bg-amber-950/20'
                      : 'border-red-900/70 bg-red-950/20'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Najbolji validacijski rezultat</p>
                      <p className="mt-1 text-sm font-semibold text-stone-100">{qualityLabels[trackedJob.metrics.quality]}</p>
                    </div>
                    <div className="flex gap-5 font-mono text-xs">
                      <span className="text-stone-400">Tačnost znakova <b className="block text-base text-stone-100">{formatPercent(trackedJob.metrics.validation_character_accuracy)}</b></span>
                      <span className="text-stone-400">CER <b className="block text-base text-stone-100">{formatPercent(trackedJob.metrics.validation_cer)}</b></span>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-stone-500">
                    Niži CER je bolji. Konačnu odluku donesite poređenjem s početnim modelom na odvojenom testnom skupu; validacijski rezultat sam po sebi nije dovoljan.
                  </p>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-stone-300">
                    <Terminal className="h-3.5 w-3.5 text-[#C5A059]" /> Izlaz procesa
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-stone-600">automatsko osvježavanje</span>
                </div>
                <div style={{ height: consoleHeight }} className="flex min-h-36 flex-col">
                  <pre
                    ref={terminalRef}
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      followConsoleRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
                    }}
                    className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-t-xl border border-b-0 border-[#252525] bg-black p-3 font-mono text-[10px] leading-4 text-stone-400"
                  >
                    {consoleLines.length ? consoleLines.join('\n') : 'Konzola je prazna. Novi redovi će se prikazati čim stignu.'}
                  </pre>
                  <div
                    role="separator"
                    aria-label="Promijenite visinu konzole"
                    aria-orientation="horizontal"
                    tabIndex={0}
                    onPointerDown={(event) => {
                      consoleResizeRef.current = { startY: event.clientY, startHeight: consoleHeight };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => resizeConsole(event.clientY)}
                    onPointerUp={(event) => {
                      consoleResizeRef.current = null;
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={() => { consoleResizeRef.current = null; }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const direction = event.key === 'ArrowUp' ? -24 : 24;
                      const maximumHeight = Math.max(224, Math.floor(window.innerHeight * 0.72));
                      setConsoleHeight((height) => Math.max(140, Math.min(maximumHeight, height + direction)));
                    }}
                    className="flex h-6 shrink-0 touch-none cursor-grab select-none items-center justify-center rounded-b-xl border border-[#353127] bg-[#171510] text-[#7A6845] transition-colors hover:border-[#6A5734] hover:bg-[#211D15] hover:text-[#D3AF65] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059]/50"
                  >
                    <Equal className="h-5 w-9 stroke-[1.8]" aria-hidden="true" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-stone-600">
                  Status se čuva u servisu i ponovo učitava kada se vratite na ovu stranicu.
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2 text-xs text-stone-300">
            <span className="font-semibold">Trening batch</span>
            <ThemedSelect
              value={selectedDatasetId}
              onChange={setSelectedDatasetId}
              disabled={loading || hasActiveJob}
              options={datasetOptions}
              ariaLabel="Odaberite trening batch"
            />
          </div>
          <label className="grid gap-2 text-xs text-stone-300">
            <span className="font-semibold">Naziv novog treninga</span>
            <input
              value={runName}
              onChange={(event) => setRunName(event.target.value)}
              maxLength={80}
              disabled={hasActiveJob}
              className="h-11 rounded-xl border border-[#343434] bg-[#0A0A0A] px-3 outline-none focus:border-[#C5A059]"
            />
          </label>
        </div>

        {selectedDataset && (
          <div className="mt-4 rounded-xl border border-[#292929] bg-black/40 p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-stone-400">
              <span>Trening: <b className="text-stone-200">{selectedDataset.report.train_samples}</b></span>
              <span>Validacija: <b className="text-stone-200">{selectedDataset.report.validation_samples}</b></span>
              <span>Test: <b className="text-stone-200">{selectedDataset.report.test_samples}</b></span>
              <span>Znakovi: <b className="text-stone-200">{selectedDataset.report.character_count}</b></span>
              <span className={selectedDataset.report.valid ? 'text-emerald-400' : 'text-red-400'}>
                {selectedDataset.report.valid ? 'Validacija uspješna' : 'Validacija neuspješna'}
              </span>
            </div>
            {selectedDataset.report.warnings.map((warning) => (
              <p key={warning} className="mt-2 text-[10px] text-amber-400">Upozorenje: {warning}</p>
            ))}
          </div>
        )}

        <section className="mt-4 rounded-xl border border-[#302D27] bg-[#0C0B09]/70 p-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-200">Osnovne postavke</h3>
            <p className="mt-1 text-[10px] text-stone-500">Dovoljne za standardno fino podešavanje modela.</p>
          </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2 text-xs text-stone-300">
            <span className="font-semibold">Model za treniranje</span>
            <ThemedSelect
              value={selectedModelId}
              onChange={setSelectedModelId}
              disabled={hasActiveJob || mode === 'scratch'}
              ariaLabel="Odaberite osnovni model za treniranje"
              options={modelOptions}
            />
          </div>
          <div className="grid gap-2 text-xs text-stone-300">
            <span className="font-semibold">Način treninga</span>
            <ThemedSelect
              value={mode}
              onChange={(value) => setMode(value as 'finetune' | 'scratch')}
              disabled={hasActiveJob}
              ariaLabel="Odaberite način treninga"
              options={[
                { value: 'finetune', label: 'Fino podešavanje odabranog modela', description: 'Preporučeno za trenutni skup' },
                { value: 'scratch', label: 'Novi model od početka', description: 'Za velike, raznovrsne skupove' },
              ]}
            />
          </div>
          <label className="grid gap-2 text-xs text-stone-300">
            <span className="font-semibold">Broj epoha</span>
            <input
              type="number" min={1} max={200} value={epochs}
              onChange={(event) => setEpochs(Math.max(1, Math.min(200, Number(event.target.value))))}
              disabled={hasActiveJob}
              className="h-11 rounded-xl border border-[#343434] bg-[#0A0A0A] px-3 outline-none"
            />
          </label>
          <label className="flex h-[68px] items-end">
            <span className="flex h-11 w-full items-center justify-between rounded-xl border border-[#343434] bg-[#0A0A0A] px-3 text-xs text-stone-300">
              Augmentacija slika
              <input type="checkbox" checked={augment} onChange={(event) => setAugment(event.target.checked)} disabled={hasActiveJob} className="h-4 w-4 accent-[#C5A059]" />
            </span>
          </label>
        </div>

        {mode === 'scratch' && (
          <p className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-300">
            Trening od početka obično zahtijeva znatno više kvalitetnih podataka. Fino podešavanje je preporučeno za trenutni skup.
          </p>
        )}
        </section>

        <section className={`mt-4 overflow-hidden rounded-xl border transition-colors ${advanced ? 'border-[#6A5734] bg-[#12100C]' : 'border-[#302D27] bg-[#0C0B09]/70'}`}>
          <button
            type="button"
            onClick={() => setAdvanced((current) => !current)}
            disabled={hasActiveJob}
            className="flex w-full items-center justify-between gap-4 p-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
            aria-expanded={advanced}
          >
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-200">
                Napredne postavke
                <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${advanced ? 'border-emerald-800 text-emerald-400' : 'border-[#444] text-stone-500'}`}>
                  {advanced ? 'aktivno' : 'isključeno'}
                </span>
              </span>
              <span className="mt-1 block text-[10px] text-stone-500">Sve opcije su prazne i koriste Ketos zadane vrijednosti dok ih ne odaberete.</span>
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-[#C5A059] transition-transform ${advanced ? 'rotate-180' : ''}`} />
          </button>

          {advanced && (
            <div className="grid gap-5 border-t border-[#302D27] p-4">
              <div>
                <h4 className="text-xs font-semibold text-[#D3AF65]">Rano zaustavljanje</h4>
                <p className="mt-1 text-[10px] leading-4 text-stone-500">
                  Broj epoha iznad ostaje čvrsti maksimum. CER i strpljenje mogu završiti trening ranije, tek nakon spremljene validacije.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['targetCer', 'Ciljni CER (%)', 'npr. 15', '0.01'],
                    ['patience', 'Strpljenje (validacije)', 'npr. 10', '1'],
                    ['minEpochs', 'Minimalno epoha', 'npr. 5', '1'],
                    ['minDelta', 'Minimalno poboljšanje (%)', 'npr. 0.1', '0.001'],
                  ].map(([key, label, placeholder, step]) => (
                    <label key={key} className="grid gap-1.5 text-[11px] text-stone-300">
                      <span>{label}</span>
                      <input type="number" min={key === 'targetCer' || key === 'minDelta' ? 0 : 1} max={key === 'targetCer' || key === 'minDelta' ? 100 : 200} step={step} value={advancedForm[key as keyof AdvancedForm]} placeholder={placeholder} onChange={(event) => updateAdvanced(key as keyof AdvancedForm, event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]" />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#D3AF65]">Optimizacija</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1.5 text-[11px] text-stone-300">
                    <span>Optimizer</span>
                    <select value={advancedForm.optimizer} onChange={(event) => updateAdvanced('optimizer', event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]">
                      <option value="">Ketos zadano</option><option>Adam</option><option>AdamW</option><option>AdamW+Muon</option><option>SGD</option><option>RMSprop</option>
                    </select>
                  </label>
                  {[
                    ['learningRate', 'Learning rate', '0.001', 'any'], ['batchSize', 'Batch size', '1', '1'],
                    ['weightDecay', 'Weight decay', '0', 'any'], ['momentum', 'Momentum', '0.9', 'any'],
                    ['gradientClip', 'Gradient clip', '1.0', 'any'], ['accumulate', 'Akumulacija batcha', '1', '1'],
                    ['warmup', 'Warmup koraci', '0', '1'], ['freezeBackbone', 'Freeze backbone uzorci', '0', '1'],
                    ['validationFrequency', 'Validacija svakih N epoha', '1', '1'],
                  ].map(([key, label, placeholder, step]) => (
                    <label key={key} className="grid gap-1.5 text-[11px] text-stone-300">
                      <span>{label}</span>
                      <input type="number" min="0" step={step} value={advancedForm[key as keyof AdvancedForm]} placeholder={placeholder} onChange={(event) => updateAdvanced(key as keyof AdvancedForm, event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]" />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#D3AF65]">Raspored learning ratea i praćenje</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1.5 text-[11px] text-stone-300">
                    <span>Scheduler</span>
                    <select value={advancedForm.schedule} onChange={(event) => updateAdvanced('schedule', event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]">
                      <option value="">Ketos zadano</option><option value="constant">Constant</option><option value="cosine">Cosine</option><option value="exponential">Exponential</option><option value="step">Step</option><option value="1cycle">1cycle</option><option value="reduceonplateau">Reduce on plateau</option>
                    </select>
                  </label>
                  {[
                    ['gamma', 'Gamma', '0.1', 'any'], ['stepSize', 'Step size', '10', '1'],
                    ['schedulerPatience', 'Scheduler patience', '5', '1'], ['cosineMaxEpochs', 'Cosine max epoha', '10', '1'],
                    ['cosineMinLr', 'Cosine minimalni LR', '0.000001', 'any'],
                  ].map(([key, label, placeholder, step]) => (
                    <label key={key} className="grid gap-1.5 text-[11px] text-stone-300">
                      <span>{label}</span>
                      <input type="number" min="0" step={step} value={advancedForm[key as keyof AdvancedForm]} placeholder={placeholder} onChange={(event) => updateAdvanced(key as keyof AdvancedForm, event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]" />
                    </label>
                  ))}
                  <label className="grid gap-1.5 text-[11px] text-stone-300">
                    <span>Logger</span>
                    <select value={advancedForm.logger} onChange={(event) => updateAdvanced('logger', event.target.value)} className="h-10 rounded-lg border border-[#343434] bg-black px-3 outline-none focus:border-[#C5A059]">
                      <option value="">Bez dodatnog loggera</option><option value="tensorboard">TensorBoard</option><option value="wandb">Weights &amp; Biases</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-[#3B3427] bg-black/40 p-4">
                <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-[#C5A059]" /><h4 className="text-xs font-semibold text-stone-200">Dodatni Ketos CLI argumenti</h4></div>
                <p className="mt-1 text-[10px] leading-4 text-stone-500">Za napredne Ketos opcije koje nisu iznad prikazane, npr. <code>--pad 16 --base-dir L</code>. Putanje, model, izlaz, uređaj i sigurnosni limit epoha ne mogu se prepisati.</p>
                <textarea value={advancedForm.additionalArgs} onChange={(event) => updateAdvanced('additionalArgs', event.target.value)} placeholder="--pad 16 --base-dir L" rows={3} className="mt-3 w-full resize-y rounded-lg border border-[#343434] bg-black p-3 font-mono text-[11px] text-stone-300 outline-none focus:border-[#C5A059]" />
              </div>
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#292929] pt-5">
          <p className="max-w-2xl text-[10px] leading-4 text-stone-500">
            Završeni model neće automatski zamijeniti aktivni model. Prvo ga preuzmite i provjerite na testnom skupu.
          </p>
          <PrimaryButton
            onClick={beginTraining}
            disabled={!selectedDataset?.report.valid || !runName.trim() || (mode === 'finetune' && !selectedModelId) || submitting || hasActiveJob}
            className="px-5 py-2.5"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            {hasActiveJob ? 'Trening je već aktivan' : submitting ? 'Pokretanje...' : 'Pokreni trening'}
          </PrimaryButton>
        </div>
      </section>

      <section className="rounded-2xl border border-[#2A2A2A] bg-[#111110] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-[#C5A059]" />
            <h3 className="font-serif font-bold text-stone-100">Dodaj vlastiti batch</h3>
          </div>
          <button type="button" onClick={() => setShowZipHelp(true)} className="inline-flex items-center gap-2 rounded-lg bg-transparent px-2 py-1.5 text-xs text-[#D3AF65] transition-colors hover:bg-[#1B1812] hover:text-[#E1C47E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059]/60">
            <CircleHelp className="h-4 w-4" /> Kako pripremiti ZIP?
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          ZIP mora sadržavati <code>train/images</code>, <code>train/labels</code>, <code>val/images</code> i <code>val/labels</code>. Nazivi slike i <code>.gt.txt</code> transkripta moraju biti jednaki.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="training-file-picker">
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
            />
            <span className="training-file-picker__action"><Upload className="h-4 w-4" /> Odaberi ZIP</span>
            <span className="training-file-picker__name">{zipFile?.name ?? 'Nijedna datoteka nije odabrana'}</span>
          </label>
          <input
            value={uploadName} onChange={(event) => setUploadName(event.target.value)}
            placeholder="Naziv batcha (opcionalno)" maxLength={80}
            className="h-11 rounded-xl border border-[#343434] bg-[#0A0A0A] px-3 text-xs outline-none"
          />
          <Button onClick={uploadDataset} disabled={!zipFile || uploading} className="inline-flex h-11 items-center gap-2 px-4">
            {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Validacija...' : 'Učitaj ZIP'}
          </Button>
        </div>
      </section>

      {showZipHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowZipHelp(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="zip-help-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[#4A402D] bg-[#11110F] shadow-2xl shadow-black"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#2A2A2A] px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-[#C5A059]">
                  <FileArchive className="h-5 w-5" />
                  <h3 id="zip-help-title" className="font-serif text-lg font-bold text-stone-100">Priprema trening ZIP-a</h3>
                </div>
                <p className="mt-1 text-xs text-stone-500">Struktura i pravila koja validator provjerava prije treninga.</p>
              </div>
              <button type="button" onClick={() => setShowZipHelp(false)} aria-label="Zatvori pomoć" className="rounded-lg border border-[#343434] p-2 text-stone-400 hover:border-[#C5A059]/50 hover:text-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D3AF65]">Očekivana struktura</h4>
                <pre className="mt-3 overflow-auto rounded-xl border border-[#292929] bg-black p-4 font-mono text-xs leading-5 text-stone-300">{`moj-batch/                 # vanjski folder je opcionalan
├── train/
│   ├── images/
│   │   ├── red_0001.png
│   │   └── red_0002.jpg
│   └── labels/
│       ├── red_0001.gt.txt
│       └── red_0002.gt.txt
├── val/
│   ├── images/
│   └── labels/
└── test/                     # opcionalno, ali preporučeno
    ├── images/
    └── labels/`}</pre>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#2A2A2A] bg-black/30 p-4">
                  <h4 className="text-xs font-semibold text-stone-200">Uparivanje datoteka</h4>
                  <p className="mt-2 text-[11px] leading-5 text-stone-500">
                    Svaka slika mora imati transkript istog osnovnog naziva: <code className="text-[#D3AF65]">red_0001.png</code> + <code className="text-[#D3AF65]">red_0001.gt.txt</code>.
                  </p>
                </div>
                <div className="rounded-xl border border-[#2A2A2A] bg-black/30 p-4">
                  <h4 className="text-xs font-semibold text-stone-200">Format transkripta</h4>
                  <p className="mt-2 text-[11px] leading-5 text-stone-500">
                    UTF-8, tačno jedan neprazan red teksta. Unicode se tokom pripreme normalizira u NFC.
                  </p>
                </div>
              </div>

              <ul className="grid gap-2 text-[11px] leading-5 text-stone-400">
                <li>• <b className="text-stone-200">train</b> i <b className="text-stone-200">val</b> su obavezni; testni skup se ne koristi za učenje.</li>
                <li>• Slike mogu biti PNG, JPG/JPEG, TIFF ili WEBP i moraju se ispravno otvoriti.</li>
                <li>• Maksimalna veličina ZIP-a je 512 MB; raspakovan sadržaj može imati najviše 4 GB i 100.000 datoteka.</li>
                <li>• Apsolutne putanje, <code>..</code> putanje i simboličke veze nisu dozvoljene.</li>
                <li>• ZIP se neće ponuditi kao batch dok sve obavezne provjere ne prođu.</li>
              </ul>

              <div className="flex justify-end border-t border-[#292929] pt-4">
                <PrimaryButton onClick={() => setShowZipHelp(false)} className="px-5">Razumijem</PrimaryButton>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="rounded-2xl border border-[#2A2A2A] bg-[#111110] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#C5A059]" />
              <h3 className="font-serif font-bold text-stone-100">eScriptorium</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              eScriptorium služi za ručnu korekciju segmentacije i transkripta prije izrade trening batcha.
            </p>
          </div>
          {escriptorium?.configured && escriptorium.url ? (
            <a href={escriptorium.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#4A402D] bg-[#211C13] px-3 py-2 text-xs text-[#D3AF65]">
              Otvori eScriptorium <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
        <div className={`mt-4 rounded-xl border px-4 py-3 text-xs ${
          escriptorium?.reachable
            ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-300'
            : 'border-[#343434] bg-black/30 text-stone-400'
        }`}>
          {!escriptorium?.configured
            ? 'Nije konfigurisan. Dodajte ESCRIPTORIUM_URL i ESCRIPTORIUM_API_TOKEN na backendu.'
            : escriptorium.reachable
              ? 'eScriptorium instanca je dostupna. Direktni prijenos dokumenata zahtijeva mapiranje projekta i dokumenta.'
              : escriptorium.message || 'eScriptorium instanca trenutno nije dostupna.'}
        </div>
      </section>

      <section className="rounded-2xl border border-[#2A2A2A] bg-[#111110] p-5 shadow-xl">
        <h3 className="font-serif font-bold text-stone-100">Historija treninga</h3>
        <div className="mt-4 grid gap-3">
          {jobs.length === 0 && <p className="rounded-xl border border-dashed border-[#343434] p-6 text-center text-xs text-stone-600">Još nema pokrenutih treninga.</p>}
          {jobs.map((job) => (
            <article key={job.id} className="rounded-xl border border-[#2B2B2B] bg-[#090909] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {activeStatuses.has(job.status) && <LoaderCircle className="h-4 w-4 animate-spin text-[#C5A059]" />}
                    <h4 className="text-sm font-semibold text-stone-200">{job.name}</h4>
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">{job.dataset_name} · {job.mode === 'finetune' ? `fino podešavanje · ${job.base_model_name ?? 'osnovni model'}` : 'od početka'} · {job.epochs} epoha</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  job.status === 'completed' ? 'border-emerald-900 text-emerald-400'
                    : job.status === 'failed' || job.status === 'interrupted' ? 'border-red-900 text-red-400'
                      : 'border-[#4A402D] text-[#C5A059]'
                }`}>{statusLabels[job.status] ?? job.status}</span>
              </div>
              {job.error_message && <p className="mt-3 text-xs text-red-400">{job.error_message}</p>}
              {job.stop_reason && <p className="mt-3 text-xs text-emerald-400">Rano zaustavljanje: {job.stop_reason}</p>}
              {job.metrics && (
                <p className="mt-3 text-[11px] text-stone-400">
                  Validacija: <b className="text-stone-200">{formatPercent(job.metrics.validation_character_accuracy)} tačnost znakova</b>
                  {' · '}CER <b className="text-stone-200">{formatPercent(job.metrics.validation_cer)}</b>
                </p>
              )}
              {job.logs?.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-stone-400">Prikaži posljednje zapise</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[#252525] bg-black p-3 font-mono text-[10px] leading-4 text-stone-400">{job.logs.join('\n')}</pre>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {activeStatuses.has(job.status) && (
                  <Button onClick={() => void stopTraining(job)} className="inline-flex items-center gap-2 text-red-300">
                    <Square className="h-3.5 w-3.5 fill-current" /> Zaustavi
                  </Button>
                )}
                {job.artifacts?.map((artifact) => (
                  <a key={artifact.id} href={getTrainingArtifactUrl(job.id, artifact.id)} className="inline-flex items-center gap-2 rounded-lg border border-[#343434] px-3 py-2 text-[11px] text-stone-300 hover:border-[#C5A059]/50">
                    <Download className="h-3.5 w-3.5" /> {artifact.name} · {formatBytes(artifact.size_bytes)}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
