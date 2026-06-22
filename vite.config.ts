import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execFile } from 'node:child_process';
import {defineConfig} from 'vite';

const runCommand = (command: string, args: string[]) => new Promise<string>((resolve, reject) => {
  execFile(command, args, { windowsHide: true, timeout: 4000 }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout.trim());
  });
});

const detectLocalGpu = async () => {
  try {
    const output = await runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits',
    ]);
    const [firstGpu] = output.split(/\r?\n/);
    const separator = firstGpu.lastIndexOf(',');
    return {
      name: firstGpu.slice(0, separator).trim(),
      memoryMb: Number(firstGpu.slice(separator + 1).trim()),
    };
  } catch {
    if (process.platform !== 'win32') return null;
    try {
      const script = "$g=Get-CimInstance Win32_VideoController | Where-Object {$_.Name -notmatch 'Microsoft Basic'} | Select-Object -First 1; [pscustomobject]@{name=$g.Name;memoryMb=[math]::Round([double]$g.AdapterRAM/1MB)} | ConvertTo-Json -Compress";
      return JSON.parse(await runCommand('powershell', ['-NoProfile', '-Command', script]));
    } catch {
      return null;
    }
  }
};

const gpuStatusPlugin = {
  name: 'local-gpu-status',
  configureServer(server: { middlewares: { use: Function } }) {
    server.middlewares.use('/api/system/gpu', async (_request: unknown, response: { statusCode: number; setHeader: Function; end: Function }) => {
      const gpu = await detectLocalGpu();
      response.statusCode = gpu ? 200 : 404;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(gpu ?? { error: 'GPU data unavailable' }));
    });
  },
  configurePreviewServer(server: { middlewares: { use: Function } }) {
    this.configureServer(server);
  },
};

const backendApiUrl = process.env.VITE_BACKEND_API_URL || process.env.BACKEND_API_URL || 'http://127.0.0.1:8001';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), gpuStatusPlugin],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/health': {
          target: backendApiUrl,
          changeOrigin: true,
        },
        '/api/ocr': {
          target: backendApiUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        '/api/health': {
          target: backendApiUrl,
          changeOrigin: true,
        },
        '/api/ocr': {
          target: backendApiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
