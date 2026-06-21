import express from 'express';
import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 8000);
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const backendApiUrl = new URL(process.env.BACKEND_API_URL || 'http://127.0.0.1:8001');

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const filteredHeaders = (headers) => Object.fromEntries(
  Object.entries(headers).filter(([key]) => !hopByHopHeaders.has(key.toLowerCase())),
);

const runCommand = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout.trim());
  });
});

const detectServerGpu = async () => {
  try {
    const output = await runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits',
    ]);
    const [firstGpu] = output.split(/\r?\n/);
    const separator = firstGpu.lastIndexOf(',');
    if (separator < 0) throw new Error('Unexpected nvidia-smi output');
    return {
      name: firstGpu.slice(0, separator).trim(),
      memoryMb: Number(firstGpu.slice(separator + 1).trim()),
      source: 'server:nvidia-smi',
    };
  } catch {
    if (process.platform !== 'win32') return null;
    try {
      const script = "$g=Get-CimInstance Win32_VideoController | Where-Object {$_.Name -notmatch 'Microsoft Basic'} | Select-Object -First 1; [pscustomobject]@{name=$g.Name;memoryMb=[math]::Round([double]$g.AdapterRAM/1MB);source='server:wmi'} | ConvertTo-Json -Compress";
      return JSON.parse(await runCommand('powershell', ['-NoProfile', '-Command', script]));
    } catch {
      return null;
    }
  }
};

app.get('/api/system/gpu', async (_request, response) => {
  const gpu = await detectServerGpu();
  response.set('Cache-Control', 'no-store');
  if (!gpu) return response.status(503).json({ error: 'Server GPU data unavailable' });
  return response.json(gpu);
});

const proxyToBackend = (request, response) => {
  const target = new URL(request.originalUrl, backendApiUrl);
  const client = target.protocol === 'https:' ? https : http;
  const headers = filteredHeaders(request.headers);
  headers.host = target.host;

  const proxyRequest = client.request(target, {
    method: request.method,
    headers,
  }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, filteredHeaders(proxyResponse.headers));
    proxyResponse.pipe(response);
  });

  proxyRequest.on('error', (error) => {
    response.status(502).json({
      error: 'Backend API unavailable',
      detail: error.message,
    });
  });

  request.pipe(proxyRequest);
};

app.get('/api/health', proxyToBackend);
app.use('/api/ocr', proxyToBackend);

app.use(express.static(dist, { maxAge: '1y', immutable: true, index: false }));
app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Bosančica.ai server listening on :${port}`);
});
