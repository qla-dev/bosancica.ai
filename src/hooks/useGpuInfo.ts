import { useEffect, useState } from 'react';

export type GpuDetectionStatus = 'detecting' | 'detected' | 'unavailable';

export interface GpuInfo {
  name: string;
  memoryMb?: number;
  status: GpuDetectionStatus;
  statusLabel: string;
}

export default function useGpuInfo() {
  const [gpuInfo, setGpuInfo] = useState<GpuInfo>({
    name: 'Otkrivam grafičku…',
    status: 'detecting',
    statusLabel: 'Provjera hardvera',
  });

  useEffect(() => {
    const controller = new AbortController();
    const detect = async () => {
      try {
        const response = await fetch('/api/system/gpu', { signal: controller.signal });
        if (!response.ok) throw new Error('Local GPU endpoint unavailable');
        const localGpu = await response.json() as { name?: string; memoryMb?: number };
        if (!localGpu.name) throw new Error('GPU name unavailable');
        setGpuInfo({
          name: localGpu.name,
          memoryMb: localGpu.memoryMb,
          status: 'detected',
          statusLabel: 'GPU spreman',
        });
      } catch {
        if (!controller.signal.aborted) {
          setGpuInfo({
            name: 'Server GPU nije dostupna',
            status: 'unavailable',
            statusLabel: 'Server GPU nije dostupna',
          });
        }
      }
    };
    void detect();
    return () => controller.abort();
  }, []);

  return gpuInfo;
}
