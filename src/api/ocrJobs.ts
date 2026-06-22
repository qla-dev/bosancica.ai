export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'model_missing' | string;
export type SegmentJobStatus = 'pending' | 'running' | 'segmented' | 'failed' | string;

export type OcrJobLine = {
  index?: number;
  text?: string | null;
} | string;

export interface OcrJob {
  id: number;
  document_name?: string | null;
  original_filename?: string | null;
  model_name?: string | null;
  status: OcrJobStatus;
  output_text?: string | null;
  output_lines?: OcrJobLine[] | null;
  confidence?: number | null;
  duration_ms?: number | null;
  error_message?: string | null;
}

export type SegmentLine = {
  index?: number;
  id?: string | null;
  text?: string | null;
  bbox?: [number, number, number, number] | number[];
  left?: number | null;
  top?: number | null;
  width?: number | null;
  height?: number | null;
  boundary?: unknown;
  baseline?: unknown;
};

export interface SegmentResponse {
  status: 'segmented' | string;
  document_name?: string | null;
  lines?: SegmentLine[] | null;
  duration_ms?: number | null;
  metadata?: {
    width?: number;
    height?: number;
    [key: string]: unknown;
  } | null;
  warnings?: string[];
}

export interface SegmentJob {
  id: number;
  document_name?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  service_url?: string | null;
  status: SegmentJobStatus;
  output_lines?: SegmentLine[] | null;
  output_metadata?: {
    width?: number;
    height?: number;
    [key: string]: unknown;
  } | null;
  duration_ms?: number | null;
  error_message?: string | null;
}

interface OcrJobResponse {
  data: OcrJob;
}

interface SegmentJobResponse {
  data: SegmentJob;
}

interface SegmentJobsResponse {
  data: SegmentJob[];
}

interface CreateOcrJobOptions {
  file: File;
  documentName?: string;
  modelName?: string;
  signal?: AbortSignal;
}

type CreateSegmentJobOptions = CreateOcrJobOptions & {
  modelId?: string;
};

const apiHeaders = {
  Accept: 'application/json',
};

const parseApiError = async (response: Response) => {
  try {
    const payload = await response.json() as {
      message?: string;
      error?: string;
      detail?: string | { message?: string };
      errors?: Record<string, string[]>;
    };

    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.detail?.message) return payload.detail.message;

    const firstValidationMessage = Object.values(payload.errors ?? {})[0]?.[0];
    if (firstValidationMessage) return firstValidationMessage;
  } catch {
    // Fall through to a generic status message.
  }

  return `OCR API returned HTTP ${response.status}.`;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...apiHeaders,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<T>;
};

export const createOcrJob = async ({
  file,
  documentName,
  modelName,
  signal,
}: CreateOcrJobOptions) => {
  const body = new FormData();
  body.append('document', file);
  if (documentName?.trim()) body.append('document_name', documentName.trim());
  if (modelName?.trim()) body.append('model_name', modelName.trim());

  const payload = await requestJson<OcrJobResponse>('/api/ocr/jobs', {
    method: 'POST',
    body,
    signal,
  });

  return payload.data;
};

export const createSegmentJob = async ({
  file,
  documentName,
  modelId,
  modelName,
  signal,
}: CreateSegmentJobOptions) => {
  const body = new FormData();
  body.append('document', file);
  if (documentName?.trim()) body.append('document_name', documentName.trim());
  if (modelId?.trim()) body.append('model_id', modelId.trim());
  if (modelName?.trim()) body.append('model_name', modelName.trim());

  const payload = await requestJson<SegmentJobResponse>('/api/ocr/segments', {
    method: 'POST',
    body,
    signal,
  });

  return payload.data;
};

export const listSegmentJobs = async (signal?: AbortSignal) => {
  const payload = await requestJson<SegmentJobsResponse>('/api/ocr/segments', { signal });
  return payload.data;
};

export const getOcrJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<OcrJobResponse>(`/api/ocr/jobs/${jobId}`, { signal });
  return payload.data;
};

export const isOcrJobTerminal = (job: OcrJob) => (
  job.status === 'completed'
  || job.status === 'failed'
  || job.status === 'model_missing'
);

export const getSegmentJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<SegmentJobResponse>(`/api/ocr/segments/${jobId}`, { signal });
  return payload.data;
};

export const getSegmentJobDocumentUrl = (jobId: number) => `/api/ocr/segments/${jobId}/document`;

export const isSegmentJobTerminal = (job: SegmentJob) => (
  job.status === 'segmented'
  || job.status === 'failed'
);

const sleep = (milliseconds: number, signal?: AbortSignal) => (
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request cancelled', 'AbortError'));
      return;
    }

    let timeout: number;
    const abort = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);

    signal?.addEventListener('abort', abort, { once: true });
  })
);

export const waitForOcrJob = async (
  jobId: number,
  signal?: AbortSignal,
  onUpdate?: (job: OcrJob) => void,
) => {
  while (true) {
    const job = await getOcrJob(jobId, signal);
    onUpdate?.(job);

    if (isOcrJobTerminal(job)) return job;

    await sleep(1500, signal);
  }
};

export const waitForSegmentJob = async (
  jobId: number,
  signal?: AbortSignal,
  onUpdate?: (job: SegmentJob) => void,
) => {
  while (true) {
    const job = await getSegmentJob(jobId, signal);
    onUpdate?.(job);

    if (isSegmentJobTerminal(job)) return job;

    await sleep(1500, signal);
  }
};
