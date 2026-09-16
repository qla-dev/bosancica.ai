import { apiUrl } from './client';

export interface ResearcherCorrectionLine {
  line_index: number;
  original_bosancica: string;
  corrected_bosancica: string;
  original_latin: string;
  corrected_latin: string;
  line_image_url?: string;
}

export interface CreateResearcherCorrectionOptions {
  ocr_job_id?: number;
  segment_job_id?: number;
  document_id: string;
  document_name?: string;
  model_id?: string;
  model_name?: string;
  lines: ResearcherCorrectionLine[];
}

export interface ResearcherCorrection {
  id: number;
  status: 'training_ready' | string;
  lines: ResearcherCorrectionLine[];
  letter_corrections: Array<{
    script: 'bosancica' | 'latin';
    line_index: number;
    position: number;
    original: string | null;
    corrected: string | null;
    operation: 'insert' | 'delete' | 'replace';
  }>;
}

export const createResearcherCorrection = async (options: CreateResearcherCorrectionOptions) => {
  const response = await fetch(apiUrl('/api/researcher-corrections'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || `Correction API returned HTTP ${response.status}.`);
  }

  return response.json() as Promise<{ data: ResearcherCorrection; training_ready: boolean }>;
};
