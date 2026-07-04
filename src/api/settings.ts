export interface SegmentationRepairSettings {
  enabled: boolean;
  trigger_multiplier: number;
  valley_threshold_ratio: number;
  min_valley_width: number;
  min_segment_height_ratio: number;
  edge_guard_ratio: number;
  merge_overlap_ratio: number;
  merge_width_ratio: number;
  merge_short_height_ratio: number;
  merge_min_height_ratio: number;
  merge_max_height_ratio: number;
}

interface SegmentationSettingsResponse {
  data: SegmentationRepairSettings;
  defaults: SegmentationRepairSettings;
}

const parseApiError = async (response: Response) => {
  try {
    const payload = await response.json() as {
      message?: string;
      errors?: Record<string, string[]>;
    };

    if (payload.message) return payload.message;
    const firstValidationMessage = Object.values(payload.errors ?? {})[0]?.[0];
    if (firstValidationMessage) return firstValidationMessage;
  } catch {
    // Fall through to the generic error.
  }

  return `API postavki je vratio HTTP ${response.status}.`;
};

const requestSettings = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<SegmentationSettingsResponse>;
};

export const getSegmentationSettings = () => requestSettings('/api/settings/segmentation');

export const updateSegmentationSettings = (settings: SegmentationRepairSettings) => (
  requestSettings('/api/settings/segmentation', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
);
