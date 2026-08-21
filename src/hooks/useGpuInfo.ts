import { useEffect, useState } from 'react';

export type RuntimeDetectionStatus = 'detecting' | 'detected' | 'unavailable';

type ModelRuntime = {
  id: string;
  label: string;
  available: boolean;
  device?: string | null;
  device_type?: 'gpu' | 'cpu' | null;
  gpu_name?: string | null;
};

export interface GpuInfo {
  name: string;
  status: RuntimeDetectionStatus;
  statusLabel: string;
  deviceType?: 'gpu' | 'cpu';
}

export default function useGpuInfo(selectedModelId: string) {
  const [gpuInfo, setGpuInfo] = useState<GpuInfo>({
    name: 'Provjeravam uređaj za modele…',
    status: 'detecting',
    statusLabel: 'Provjera modela',
  });

  useEffect(() => {
    const controller = new AbortController();
    const detect = async () => {
      try {
        const response = await fetch('/api/system/runtime', { signal: controller.signal });
        if (!response.ok) throw new Error('Model runtime endpoint unavailable');

        const payload = await response.json() as { models?: ModelRuntime[] };
        const models = payload.models ?? [];
        const selected = models.find((model) => model.id === selectedModelId);
        if (!selected?.available || !selected.device_type) throw new Error('Selected model service unavailable');

        const count = models.filter((model) => (
          model.available && model.device_type === selected.device_type
        )).length;
        const hardware = selected.device_type === 'gpu'
          ? (selected.gpu_name || selected.device || 'GPU')
          : 'CPU (GPU nije dostupna)';

        setGpuInfo({
          name: `${selected.label} · ${hardware}`,
          status: 'detected',
          statusLabel: selected.device_type === 'gpu'
            ? `${count} modela koriste GPU`
            : `${count} modela koriste CPU fallback`,
          deviceType: selected.device_type,
        });
      } catch {
        if (!controller.signal.aborted) {
          setGpuInfo({
            name: 'Uređaj modela trenutno nije dostupan',
            status: 'unavailable',
            statusLabel: 'Servis modela nije dostupan',
          });
        }
      }
    };

    void detect();
    const timer = window.setInterval(detect, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selectedModelId]);

  return gpuInfo;
}
