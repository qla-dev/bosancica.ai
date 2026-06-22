export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'model_missing' | string;

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

interface OcrJobResponse {
  data: OcrJob;
}

interface CreateOcrJobOptions {
  file: File;
  documentName?: string;
  modelName?: string;
  signal?: AbortSignal;
}

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

export const getOcrJob = async (jobId: number, signal?: AbortSignal) => {
  const payload = await requestJson<OcrJobResponse>(`/api/ocr/jobs/${jobId}`, { signal });
  return payload.data;
};

export const isOcrJobTerminal = (job: OcrJob) => (
  job.status === 'completed'
  || job.status === 'failed'
  || job.status === 'model_missing'
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
