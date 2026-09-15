export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'model_missing' | string;
export type SegmentJobStatus = 'pending' | 'running' | 'segmented' | 'failed' | 'cancelled' | string;

export interface OcrModelOption {
  id: string;
  label: string;
  description: string;
  badge?: string;
}

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
  segment_job_id?: number | null;
  normalization?: NormalizationResult | null;
}

export interface NormalizationResult {
  modern_bosnian: string;
  paragraphs: string[];
  summary: string;
  document_type: string;
  uncertainties: string[];
  model: string;
  duration_ms: number;
}

export type SegmentLine = {
  index?: number;
  id?: string | null;
  text?: string | null;
  line_image_path?: string | null;
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
  client_request_id?: string | null;
  status: SegmentJobStatus;
  output_lines?: SegmentLine[] | null;
  output_metadata?: {
    width?: number;
    height?: number;
    [key: string]: unknown;
  } | null;
  duration_ms?: number | null;
  error_message?: string | null;
  kraken_response?: SegmentResponse | null;
  openrouter_segments?: Record<string, unknown> | null;
  ai_corrected_segments?: Record<string, unknown> | null;
  ocr_job?: OcrJob | null;
}

export type BookDocument = SegmentJob & {
  book_source: 'segment' | 'ocr';
};

interface OcrJobResponse {
  data: OcrJob;
}

interface SegmentJobResponse {
  data: SegmentJob;
}

interface SegmentJobsResponse {
  data: SegmentJob[];
}

interface BookDocumentsResponse {
  data: BookDocument[];
}

interface OcrModelsResponse {
  data: OcrModelOption[];
}

interface NormalizationResponse {
  data: NormalizationResult;
}

interface CreateOcrJobOptions {
  file?: File;
  segmentJobId?: number;
  documentName?: string;
  modelId?: string;
  modelName?: string;
  signal?: AbortSignal;
}

type CreateSegmentJobOptions = CreateOcrJobOptions & {
  clientRequestId?: string;
};

const apiHeaders = {
  Accept: 'application/json',
};

class OcrApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'OcrApiError';
  }
}

const transientApiStatuses = new Set([429, 502, 503, 504]);

const isTransientApiError = (error: unknown): error is OcrApiError => (
  error instanceof OcrApiError && transientApiStatuses.has(error.status)
);

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
    throw new OcrApiError(await parseApiError(response), response.status);
  }

  return response.json() as Promise<T>;
};

export const createOcrJob = async ({
  file,
  segmentJobId,
  documentName,
  modelId,
  modelName,
  signal,
}: CreateOcrJobOptions) => {
  const body = new FormData();
  if (file) body.append('document', file);
  if (segmentJobId) body.append('segment_job_id', String(segmentJobId));
  if (documentName?.trim()) body.append('document_name', documentName.trim());
  if (modelId?.trim()) body.append('model_id', modelId.trim());
  if (modelName?.trim()) body.append('model_name', modelName.trim());

  const payload = await requestJson<OcrJobResponse>('/api/ocr/jobs', {
    method: 'POST',
    body,
    signal,
  });

  return payload.data;
};

export const normalizeModernBosnian = async (text: string, ocrJobId?: number, signal?: AbortSignal) => {
  const payload = await requestJson<NormalizationResponse>('/api/normalizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(ocrJobId ? { ocr_job_id: ocrJobId } : {}) }),
    signal,
  });

  return payload.data;
};

export const listOcrModels = async (signal?: AbortSignal) => {
  const payload = await requestJson<OcrModelsResponse>('/api/ocr/models', { signal });
  return payload.data;
};

export const createSegmentJob = async ({
  file,
  documentName,
  modelId,
  modelName,
  clientRequestId,
  signal,
}: CreateSegmentJobOptions) => {
  const body = new FormData();
  body.append('document', file);
  if (documentName?.trim()) body.append('document_name', documentName.trim());
  if (modelId?.trim()) body.append('model_id', modelId.trim());
  if (modelName?.trim()) body.append('model_name', modelName.trim());
  if (clientRequestId?.trim()) body.append('client_request_id', clientRequestId.trim());

  const payload = await requestJson<SegmentJobResponse>('/api/ocr/segments', {
    method: 'POST',
    body,
    signal,
  });

  return payload.data;
};

export const listSegmentJobs = async (signal?: AbortSignal) => {
  const payload = await requestJson<SegmentJobsResponse>('/api/ocr/segments', { signal, cache: 'no-store' });
  return payload.data;
};

export const listBookDocuments = async (signal?: AbortSignal) => {
  const payload = await requestJson<BookDocumentsResponse>('/api/ocr/segments/books', { signal, cache: 'no-store' });
  return payload.data;
};

export const getOcrJobDocumentUrl = (jobId: number) => `/api/ocr/jobs/${jobId}/document`;

export const getOcrJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<OcrJobResponse>(`/api/ocr/jobs/${jobId}`, { signal });
  return payload.data;
};

export const retryOcrJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<OcrJobResponse>(`/api/ocr/jobs/${jobId}/retry`, { method: 'POST', signal });
  return payload.data;
};

export const cancelOcrJob = async (jobId: number) => {
  const payload = await requestJson<OcrJobResponse>(`/api/ocr/jobs/${jobId}/cancel`, { method: 'POST' });
  return payload.data;
};

export const isOcrJobTerminal = (job: OcrJob) => (
  job.status === 'completed'
  || job.status === 'failed'
  || job.status === 'model_missing'
  || job.status === 'cancelled'
);

export const getSegmentJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<SegmentJobResponse>(`/api/ocr/segments/${jobId}`, { signal });
  return payload.data;
};

export const deleteSegmentJob = async (jobId: number) => {
  await requestJson<{ deleted: boolean }>(`/api/ocr/segments/${jobId}`, { method: 'DELETE' });
};

export const retrySegmentJob = async (jobId: number, options?: { modelId?: string; modelName?: string; signal?: AbortSignal }) => {
  const payload = await requestJson<SegmentJobResponse>(`/api/ocr/segments/${jobId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: options?.modelId, model_name: options?.modelName }),
    signal: options?.signal,
  });
  return payload.data;
};

export const cancelSegmentJob = async (jobId: number) => {
  const payload = await requestJson<SegmentJobResponse>(`/api/ocr/segments/${jobId}/cancel`, { method: 'POST' });
  return payload.data;
};

export const getSegmentJobDocumentUrl = (jobId: number) => `/api/ocr/segments/${jobId}/document`;
export const getSegmentJobLineImageUrl = (jobId: number, lineIndex: number) => `/api/ocr/segments/${jobId}/lines/${lineIndex}`;

export const runAdditionalSegmentation = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<SegmentJobResponse>(
    `/api/ocr/segments/${jobId}/additional-segmentation`,
    {
      method: 'POST',
      signal,
    },
  );

  return payload.data;
};

export const isSegmentJobTerminal = (job: SegmentJob) => (
  job.status === 'segmented'
  || job.status === 'failed'
  || job.status === 'cancelled'
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
  let transientFailures = 0;
  const startedAt = Date.now();
  const maximumWaitMs = 16 * 60 * 1000;

  while (true) {
    if (Date.now() - startedAt >= maximumWaitMs) {
      throw new Error('Obrada je prekoračila 16 minuta. Provjerite queue worker i pokušajte ponovo.');
    }
    try {
      const job = await getOcrJob(jobId, signal);
      transientFailures = 0;
      onUpdate?.(job);

      if (isOcrJobTerminal(job)) return job;
    } catch (error) {
      if (!isTransientApiError(error) || transientFailures >= 5) throw error;
      transientFailures += 1;
      await sleep(Math.min(8000, 750 * (2 ** (transientFailures - 1))), signal);
      continue;
    }

    await sleep(1500, signal);
  }
};

export const waitForSegmentJob = async (
  jobId: number,
  signal?: AbortSignal,
  onUpdate?: (job: SegmentJob) => void,
) => {
  let transientFailures = 0;
  const startedAt = Date.now();
  const maximumWaitMs = 16 * 60 * 1000;

  while (true) {
    if (Date.now() - startedAt >= maximumWaitMs) {
      throw new Error('Segmentacija je prekoračila 16 minuta. Provjerite queue worker i pokušajte ponovo.');
    }
    try {
      const job = await getSegmentJob(jobId, signal);
      transientFailures = 0;
      onUpdate?.(job);

      if (isSegmentJobTerminal(job)) return job;
    } catch (error) {
      if (!isTransientApiError(error) || transientFailures >= 5) throw error;
      transientFailures += 1;
      await sleep(Math.min(8000, 750 * (2 ** (transientFailures - 1))), signal);
      continue;
    }

    await sleep(1500, signal);
  }
};
