export type DatasetReport = {
  valid: boolean;
  train_samples: number;
  validation_samples: number;
  test_samples: number;
  character_count: number;
  normalization_changes: number;
  errors: string[];
  warnings: string[];
};

export type TrainingDataset = {
  id: string;
  name: string;
  source: 'local' | 'upload';
  report: DatasetReport;
  uploaded_at?: string;
};

export type TrainingArtifact = {
  id: string;
  name: string;
  size_bytes: number;
};

export type TrainingModel = {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  default: boolean;
};

export type TrainingJob = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'interrupted';
  dataset_id: string;
  dataset_name: string;
  mode: 'finetune' | 'scratch';
  epochs: number;
  augment: boolean;
  base_model_id?: string | null;
  base_model_name?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  stop_reason?: string | null;
  completed_epochs?: number | null;
  advanced?: boolean;
  active_command?: string | null;
  metrics?: {
    validation_character_accuracy: number;
    validation_cer: number;
    quality: 'good' | 'usable' | 'poor';
    source: string;
  } | null;
  elapsed_seconds?: number;
  progress?: {
    phase: string;
    label: string;
    percent: number | null;
    current_epoch: number | null;
    total_epochs: number;
    current_batch?: number | null;
    total_batches?: number | null;
    epoch_percent?: number | null;
    indeterminate: boolean;
    updated_at?: string;
  };
  logs: string[];
  artifacts: TrainingArtifact[];
};

export type TrainingAdvancedOptions = {
  advanced?: boolean;
  target_cer?: number | null;
  early_stopping_patience?: number | null;
  min_epochs?: number | null;
  min_delta?: number | null;
  optimizer?: 'Adam' | 'AdamW' | 'AdamW+Muon' | 'SGD' | 'RMSprop' | null;
  learning_rate?: number | null;
  batch_size?: number | null;
  weight_decay?: number | null;
  momentum?: number | null;
  gradient_clip?: number | null;
  accumulate_grad_batches?: number | null;
  warmup?: number | null;
  freeze_backbone?: number | null;
  validation_frequency?: number | null;
  schedule?: 'cosine' | 'constant' | 'exponential' | 'step' | '1cycle' | 'reduceonplateau' | null;
  gamma?: number | null;
  step_size?: number | null;
  scheduler_patience?: number | null;
  cosine_max_epochs?: number | null;
  cosine_min_lr?: number | null;
  logger?: 'tensorboard' | 'wandb' | null;
  additional_ketos_args?: string | null;
};

export type EscriptoriumStatus = {
  configured: boolean;
  reachable: boolean;
  url: string | null;
  message?: string | null;
};

class TrainingApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TrainingApiError';
  }
}

const parseError = async (response: Response) => {
  try {
    const payload = await response.json() as {
      detail?: string;
      message?: string;
      errors?: Record<string, string[]>;
    };
    if (payload.detail) return payload.detail;
    if (payload.message) return payload.message;
    const first = Object.values(payload.errors ?? {})[0]?.[0];
    if (first) return first;
  } catch {
    // Use the generic message below.
  }
  return `Servis za treniranje vratio je HTTP ${response.status}.`;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new TrainingApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
};

export const listTrainingDatasets = async () => {
  const payload = await requestJson<{ data: TrainingDataset[] }>('/api/training/datasets');
  return payload.data;
};

export const listTrainingModels = async () => {
  const payload = await requestJson<{ data: TrainingModel[] }>('/api/training/models');
  return payload.data;
};

export const uploadTrainingDataset = async (file: File, name?: string) => {
  const body = new FormData();
  body.append('dataset', file);
  if (name?.trim()) body.append('name', name.trim());
  const payload = await requestJson<{ data: TrainingDataset }>('/api/training/datasets', {
    method: 'POST', body,
  });
  return payload.data;
};

export const listTrainingJobs = async () => {
  const payload = await requestJson<{ data: TrainingJob[] }>('/api/training/jobs');
  return payload.data;
};

export const startTraining = async (options: {
  dataset_id: string;
  name: string;
  mode: 'finetune' | 'scratch';
  epochs: number;
  augment: boolean;
  base_model_id?: string | null;
} & TrainingAdvancedOptions) => {
  const payload = await requestJson<{ data: TrainingJob }>('/api/training/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return payload.data;
};

export const cancelTraining = async (jobId: string) => {
  const payload = await requestJson<{ data: TrainingJob }>(`/api/training/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  return payload.data;
};

export const getTrainingArtifactUrl = (jobId: string, artifactId: string) => (
  `/api/training/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`
);

export const getEscriptoriumStatus = async () => {
  const payload = await requestJson<{ data: EscriptoriumStatus }>('/api/training/escriptorium');
  return payload.data;
};
