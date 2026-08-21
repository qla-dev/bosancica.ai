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
const backendOrigin = backendApiUrl.origin;
const backendHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });
const backendHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });
const retryableGatewayErrorCodes = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
]);

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

app.get('/gateway/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({
    service: 'bosancica-frontend-gateway',
    ok: true,
    backend_api_url: backendOrigin,
  });
});

const proxyToBackend = (request, response) => {
  const target = new URL(request.originalUrl, backendApiUrl);
  const client = target.protocol === 'https:' ? https : http;
  const agent = target.protocol === 'https:' ? backendHttpsAgent : backendHttpAgent;
  const headers = filteredHeaders(request.headers);
  headers.host = target.host;
  const canRetry = request.method === 'GET' || request.method === 'HEAD';

  // Log API traffic at the gateway. This deliberately excludes request bodies
  // and uploaded filenames, while making failed uploads diagnosable even when
  // Laravel never receives the request.
  const requestStartedAt = Date.now();
  const logProxyResult = (status, detail) => {
    console.log(JSON.stringify({
      event: 'api_proxy',
      method: request.method,
      path: request.originalUrl,
      status,
      content_length: request.headers['content-length'] ?? null,
      duration_ms: Date.now() - requestStartedAt,
      ...(detail ? { detail } : {}),
    }));
  };

  let activeProxyRequest;
  let completed = false;

  const startProxyAttempt = (attempt) => {
    if (completed || response.destroyed) return;

    const proxyRequest = client.request(target, {
      method: request.method,
      headers,
      agent,
    }, (proxyResponse) => {
      completed = true;
      logProxyResult(proxyResponse.statusCode || 502);
      response.writeHead(proxyResponse.statusCode || 502, filteredHeaders(proxyResponse.headers));
      proxyResponse.pipe(response);
    });
    activeProxyRequest = proxyRequest;

    proxyRequest.once('error', (error) => {
      if (completed) return;

      const retryable = canRetry
        && retryableGatewayErrorCodes.has(error.code)
        && attempt < 2;
      if (retryable) {
        const retryDelayMs = attempt === 0 ? 250 : 750;
        console.warn(JSON.stringify({
          event: 'api_proxy_retry',
          method: request.method,
          path: request.originalUrl,
          attempt: attempt + 1,
          error_code: error.code,
          detail: error.message,
        }));
        setTimeout(() => startProxyAttempt(attempt + 1), retryDelayMs);
        return;
      }

      completed = true;
      logProxyResult(502, error.message);
      if (!response.headersSent) {
        response.status(502).json({
          error: 'Backend API unavailable',
          detail: error.message,
          upstream: backendOrigin,
        });
      } else {
        response.destroy(error);
      }
    });

    if (canRetry) proxyRequest.end();
    else request.pipe(proxyRequest);
  };

  request.once('aborted', () => activeProxyRequest?.destroy());
  response.once('close', () => {
    if (!completed) activeProxyRequest?.destroy();
  });

  startProxyAttempt(0);
};

app.use('/api', proxyToBackend);

app.use(express.static(dist, { maxAge: '1y', immutable: true, index: false }));
app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Bosančica.ai server listening on :${port}`);
  console.log(`Proxying /api/* to ${backendOrigin}`);
});
