import { useEffect, useState } from 'react';

export type GpuDetectionStatus = 'detecting' | 'detected' | 'masked' | 'software' | 'unavailable';

export interface GpuInfo {
  name: string;
  status: GpuDetectionStatus;
  statusLabel: string;
}

const cleanRendererName = (renderer: string) => {
  const withoutAngle = renderer.replace(/^ANGLE\s*\(/i, '').replace(/\)$/g, '');
  const parts = withoutAngle.split(',').map((part) => part.trim());
  const likelyDevice = parts.find((part, index) => index > 0 && /(NVIDIA|AMD|Radeon|GeForce|Intel|Apple|Adreno|Mali)/i.test(part));
  return (likelyDevice ?? parts[0] ?? renderer)
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s*Direct3D.*$/i, '')
    .trim();
};

const detectBrowserGpu = (): GpuInfo => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) {
    return { name: 'GPU nije dostupna', status: 'unavailable', statusLabel: 'WebGL nije dostupan' };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as {
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const cleaned = cleanRendererName(renderer);

  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    return { name: cleaned, status: 'software', statusLabel: 'Softversko renderovanje' };
  }
  if (!debugInfo || /webkit webgl|masked|generic/i.test(renderer)) {
    return { name: 'GPU skrivena preglednikom', status: 'masked', statusLabel: 'WebGL aktivan' };
  }
  return { name: cleaned, status: 'detected', statusLabel: 'GPU detektovana' };
};

export default function useGpuInfo() {
  const [gpuInfo, setGpuInfo] = useState<GpuInfo>({
    name: 'Otkrivam grafičku…',
    status: 'detecting',
    statusLabel: 'Provjera hardvera',
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setGpuInfo(detectBrowserGpu()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return gpuInfo;
}
