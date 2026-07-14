import { app, ipcMain } from 'electron';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { generate as generateCert } from 'selfsigned';
import * as db from './db';
import { RPC_CHANNELS } from './rpcMap';
import type { PortalStatus } from '../src/types';

// The LAN web portal: while the desktop app runs, the same UI is served over
// plain HTTP so any browser on the local network can use WICKED against the
// same data. The browser gets /__portal/bridge.js, which recreates
// window.polyglot by relaying every call to the same IPC handlers the desktop
// renderer uses. Access requires a per-install token carried in the portal URL
// (?token=…) and sent as a header on every data request.

type IpcListener = (event: unknown, ...args: unknown[]) => unknown;

// All ipcMain handlers, captured as they are registered so the portal can
// invoke them directly (Electron offers no way to look them up later).
const handlers = new Map<string, IpcListener>();

// Wrap ipcMain.handle before registerIpc() runs. Handlers never use the event
// argument (they are all written as (_e, ...args)), so calling them with a
// stub event from the portal is safe.
export function captureIpcHandlers(): void {
  const original = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = ((channel: string, listener: IpcListener) => {
    handlers.set(channel, listener);
    return original(channel, listener as Parameters<typeof original>[1]);
  }) as typeof ipcMain.handle;
}

// Channels that only make sense on the desktop (native dialogs, opening host
// folders, installing updates). The browser bridge replaces these with
// browser-native equivalents; this set is the server-side backstop.
const DESKTOP_ONLY = new Set([
  'dialog:openFile',
  'dialog:openVaultFolder',
  'pb:chooseDataFolder',
  'pb:importImage',
  'export:markdown',
  'export:pdf',
  'update:install',
  'shell:openExternal',
  'rp:openMemoryFolder',
]);

const PORTAL_CHANNELS = new Set(Object.values(RPC_CHANNELS));
const MAX_BODY_BYTES = 128 * 1024 * 1024; // message attachments arrive as base64 JSON
const DEFAULT_PORT = 8967;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let rendererDist = '';
let server: http.Server | null = null;
let httpsServer: https.Server | null = null;
let currentPort = 0;
let currentHttpsPort = 0;
let lastError = '';

export function init(distDir: string): void {
  rendererDist = distDir;
}

// Start/stop/restart the server to match the saved settings. Called at app
// startup and whenever the portal settings change.
export function sync(): void {
  const settings = db.getSettings();
  if (!settings.webPortalEnabled) {
    stop();
    return;
  }
  if (!settings.webPortalToken) {
    db.saveSettings({ webPortalToken: randomBytes(8).toString('hex') });
  }
  const port =
    Number.isInteger(settings.webPortalPort) &&
    settings.webPortalPort > 0 &&
    settings.webPortalPort < 65536
      ? settings.webPortalPort
      : DEFAULT_PORT;
  if (server && currentPort === port) return;

  stop();
  lastError = '';
  const onRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    handleRequest(req, res).catch((err) => {
      console.warn('[portal]', (err as Error).message);
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal error');
    });
  };
  const srv = http.createServer(onRequest);
  srv.on('error', (err) => {
    lastError = (err as Error).message;
    server = null;
    currentPort = 0;
  });
  srv.listen(port, '0.0.0.0', () => {
    currentPort = port;
    console.log(`[portal] serving on port ${port}`);
  });
  server = srv;

  // HTTPS twin on port+1: phone browsers refuse microphone access on plain
  // http origins, so voice in the portal needs a secure (if self-signed)
  // context. Failure here must never take down the http portal.
  void startHttps(port < 65535 ? port + 1 : port - 1, onRequest);
}

async function startHttps(
  port: number,
  onRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<void> {
  try {
    const { key, cert } = await loadOrCreateCert();
    const srv = https.createServer({ key, cert }, onRequest);
    srv.on('error', (err) => {
      console.warn('[portal] https:', (err as Error).message);
      httpsServer = null;
      currentHttpsPort = 0;
    });
    srv.listen(port, '0.0.0.0', () => {
      currentHttpsPort = port;
      console.log(`[portal] https serving on port ${port}`);
    });
    httpsServer = srv;
  } catch (err) {
    console.warn('[portal] https disabled:', (err as Error).message);
  }
}

// Self-signed cert for the LAN portal, persisted in userData and regenerated
// when the machine's LAN addresses are no longer all covered by its SANs.
async function loadOrCreateCert(): Promise<{ key: string; cert: string; ips: string[] }> {
  const file = path.join(app.getPath('userData'), 'portal-cert.json');
  const ips = lanAddresses().filter((ip) => ip !== 'localhost');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      key: string;
      cert: string;
      ips: string[];
      createdAt: number;
    };
    const fresh = Date.now() - saved.createdAt < 9 * 365 * 24 * 3600_000;
    if (fresh && ips.every((ip) => saved.ips.includes(ip))) return saved;
  } catch {
    // Missing or unreadable — generate below.
  }
  const pems = await generateCert([{ name: 'commonName', value: 'WICKED Portal' }], {
    notAfterDate: new Date(Date.now() + 3650 * 24 * 3600_000),
    keySize: 2048,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });
  const record = { key: pems.private, cert: pems.cert, ips, createdAt: Date.now() };
  try {
    fs.writeFileSync(file, JSON.stringify(record), 'utf-8');
  } catch (err) {
    console.warn('[portal] could not persist cert:', (err as Error).message);
  }
  return record;
}

export function stop(): void {
  server?.close();
  server = null;
  currentPort = 0;
  httpsServer?.close();
  httpsServer = null;
  currentHttpsPort = 0;
}

export function getStatus(): PortalStatus {
  const settings = db.getSettings();
  const running = !!server && server.listening;
  const httpsRunning = !!httpsServer && httpsServer.listening;
  const ips = lanAddresses();
  const urls = [
    ...(running ? ips.map((ip) => `http://${ip}:${currentPort}/?token=${settings.webPortalToken}`) : []),
    ...(httpsRunning
      ? ips.map((ip) => `https://${ip}:${currentHttpsPort}/?token=${settings.webPortalToken}`)
      : []),
  ];
  return {
    enabled: settings.webPortalEnabled,
    running,
    port: running ? currentPort : settings.webPortalPort || DEFAULT_PORT,
    urls,
    error: lastError || undefined,
  };
}

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out.length > 0 ? out : ['localhost'];
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (pathname === '/__portal/bridge.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(bridgeJs());
    return;
  }

  if (pathname === '/__portal/rpc') {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    await handleRpc(req, res);
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  serveStatic(pathname, res);
}

async function handleRpc(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };

  const token = db.getSettings().webPortalToken;
  if (!token || req.headers['x-portal-token'] !== token) {
    json(401, { ok: false, error: 'Invalid or missing portal token' });
    return;
  }

  let body: { channel?: string; args?: unknown[] };
  try {
    body = JSON.parse(await readBody(req)) as typeof body;
  } catch (err) {
    json(400, { ok: false, error: (err as Error).message });
    return;
  }

  const channel = String(body.channel ?? '');
  if (!PORTAL_CHANNELS.has(channel)) {
    json(404, { ok: false, error: `Unknown method: ${channel}` });
    return;
  }
  if (DESKTOP_ONLY.has(channel)) {
    json(200, { ok: false, error: 'This action is only available in the desktop app.' });
    return;
  }
  const handler = handlers.get(channel);
  if (!handler) {
    json(404, { ok: false, error: `No handler for: ${channel}` });
    return;
  }

  try {
    const args = Array.isArray(body.args) ? body.args : [];
    const result = await handler({ portal: true }, ...args);
    json(200, { ok: true, result: result === undefined ? null : result });
  } catch (err) {
    json(200, { ok: false, error: (err as Error).message });
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
  if (!rendererDist || !fs.existsSync(path.join(rendererDist, 'index.html'))) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('WICKED web portal: no built UI found. This works in the installed app.');
    return;
  }

  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const root = path.normalize(rendererDist + path.sep);
  const filePath = path.normalize(path.join(rendererDist, rel));
  if (!filePath.startsWith(root) && filePath + path.sep !== root) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (rel !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Everything else (including /) gets the app shell with the bridge injected
  // ahead of the module scripts, so window.polyglot exists before the app runs.
  const html = fs
    .readFileSync(path.join(rendererDist, 'index.html'), 'utf-8')
    .replace('<head>', '<head>\n    <script src="/__portal/bridge.js"></script>');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

// The browser-side bridge. Generated (not a static asset) so the method →
// channel map is always the one this build was compiled with. Kept to plain
// ES5-style JS since it is served raw, without any build step.
function bridgeJs(): string {
  return `(function () {
  'use strict';

  // crypto.randomUUID is unavailable on insecure (http://) origins.
  if (window.crypto && !window.crypto.randomUUID) {
    window.crypto.randomUUID = function () {
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var h = Array.prototype.map
        .call(b, function (x) { return ('0' + x.toString(16)).slice(-2); })
        .join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
        h.slice(16, 20) + '-' + h.slice(20);
    };
  }

  var CHANNELS = ${JSON.stringify(RPC_CHANNELS)};

  // The token arrives once via ?token=… and is kept in localStorage.
  var token = '';
  try {
    var u = new URL(window.location.href);
    var t = u.searchParams.get('token');
    if (t) {
      window.localStorage.setItem('wickedPortalToken', t);
      u.searchParams.delete('token');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
    token = window.localStorage.getItem('wickedPortalToken') || '';
  } catch (e) { /* private mode etc. */ }

  var deniedShown = false;
  function showDenied() {
    if (deniedShown) return;
    deniedShown = true;
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,.88);color:#fff;font-family:sans-serif;' +
      'text-align:center;padding:24px;';
    d.innerHTML = '<div style="max-width:420px"><h2 style="margin-bottom:8px">Access denied</h2>' +
      '<p>Open the portal with the full link (including <code>?token=…</code>) shown in the ' +
      'desktop app under <b>Settings → Web portal</b>.</p></div>';
    var add = function () { document.body.appendChild(d); };
    if (document.body) add();
    else window.addEventListener('DOMContentLoaded', add);
  }

  function rpc(channel, args) {
    return window.fetch('/__portal/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-portal-token': token },
      body: JSON.stringify({ channel: channel, args: args }),
    }).then(function (res) {
      if (res.status === 401) {
        showDenied();
        throw new Error('Web portal: access denied.');
      }
      return res.json();
    }).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'Request failed');
      return j.result;
    });
  }

  var api = {};
  Object.keys(CHANNELS).forEach(function (method) {
    api[method] = function () {
      return rpc(CHANNELS[method], Array.prototype.slice.call(arguments));
    };
  });

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.onchange = function () {
        resolve(input.files && input.files[0] ? input.files[0] : null);
      };
      input.oncancel = function () { resolve(null); };
      input.click();
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('Could not read the file')); };
      r.readAsDataURL(file);
    });
  }

  // Browser-native replacements for desktop-only dialogs.
  api.openFileDialog = function () {
    return pickFile('.jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md').then(function (file) {
      if (!file) return null;
      return fileToDataUrl(file).then(function (dataUrl) {
        var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        var read = /\\.(txt|md)$/i.test(file.name) ? file.text() : Promise.resolve(undefined);
        return read.then(function (text) {
          return {
            name: file.name,
            mime: file.type || 'application/octet-stream',
            data: base64,
            text: text,
          };
        });
      });
    });
  };

  api.pbImportImage = function (projectId) {
    return pickFile('image/*').then(function (file) {
      if (!file) return null;
      return fileToDataUrl(file).then(function (dataUrl) {
        return rpc(CHANNELS.pbSaveAsset, [projectId, dataUrl]).then(function (r) {
          return { assetId: r.assetId, dataUrl: dataUrl };
        });
      });
    });
  };

  api.exportMarkdown = function (filename, content) {
    var blob = new Blob([content], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '.md';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    return Promise.resolve(a.download);
  };

  api.exportPDF = function () { return Promise.resolve(null); };
  api.openVaultFolderDialog = function () { return Promise.resolve(null); };
  api.pbChooseDataFolder = function () { return Promise.resolve(null); };
  api.installUpdate = function () {
    return Promise.resolve('Updates are installed from the desktop app.');
  };
  api.rpOpenMemoryFolder = function () { return Promise.resolve(); };
  api.openExternal = function (p) {
    if (/^https?:\\/\\//i.test(String(p))) window.open(p, '_blank', 'noopener');
    return Promise.resolve();
  };

  window.polyglot = api;
})();
`;
}
