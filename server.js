import express from 'express';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 8000);
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');

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

app.use(express.static(dist, { maxAge: '1y', immutable: true, index: false }));
app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Bosančica.ai server listening on :${port}`);
});
