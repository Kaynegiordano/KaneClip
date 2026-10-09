// KaneClip — processus principal Electron : fenêtre, accès disque, protocole média
// (lecture avec requêtes partielles pour la navigation dans les vidéos) et ffmpeg.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { execFile } = require('child_process');

app.setName('KaneClip');
// La lecture (horloge, synchronisation audio/vidéo) ne doit pas se figer quand la fenêtre est recouverte
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (process.platform === 'win32') app.setAppUserModelId('com.kane.kaneclip');

// kcm://f/<chemin encodé> : sert n'importe quel fichier local à la page (vidéo, audio, image)
protocol.registerSchemesAsPrivileged([{
  scheme: 'kcm',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
}]);

let win = null;
let allowClose = false;
const pending = [];

function filesFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter(a => {
    if (!a || a.startsWith('-')) return false;
    try { return fs.statSync(a).isFile(); } catch { return false; }
  });
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
const tools = require('./media-tools.cjs')({ app, send });
const updater = require('./updater.cjs')(() => win);
const ai = require('./ai-upscale.cjs')({ app, send, tools });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (!win) { pending.push(...files); return; }
    if (win.isMinimized()) win.restore();
    win.focus();
    files.forEach(p => send('open-path', p));
  });
  pending.push(...filesFromArgv(process.argv));
  app.whenReady().then(() => { registerProtocol(); createWindow(); });
}

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
};

function registerProtocol() {
  protocol.handle('kcm', async req => {
    try {
      const u = new URL(req.url);
      const file = decodeURIComponent(u.pathname.slice(1));
      const st = await fs.promises.stat(file);
      const size = st.size;
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.get('range');
      const m = range && range.match(/bytes=(\d*)-(\d*)/);
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
        let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
        start = Math.max(0, start); end = Math.min(size - 1, end);
        if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        const stream = fs.createReadStream(file, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
        });
      }
      // Les vignettes changent de contenu à chemin constant (cache vidé) : pas de cache navigateur
      return new Response(Readable.toWeb(fs.createReadStream(file)), {
        status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      });
    } catch (err) {
      return new Response('Introuvable', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 980, minWidth: 1100, minHeight: 680,
    backgroundColor: '#1c1d21',
    title: 'KaneClip',
    icon: path.join(__dirname, 'app', process.platform === 'win32' ? 'kaneclip.ico' : 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1c1d21', symbolColor: '#c9ccd3', height: 36 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (process.platform === 'win32') {
    win.setAppDetails({
      appId: 'com.kane.kaneclip',
      appIconPath: path.join(__dirname, 'app', 'kaneclip.ico'),
      appIconIndex: 0,
      relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${__dirname}"`,
      relaunchDisplayName: 'KaneClip',
    });
  }
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', e => {
    if (allowClose) return;
    e.preventDefault();
    send('close-request');
  });
  win.on('closed', () => { win = null; });
  updater.checkSoon();
}

app.on('window-all-closed', () => app.quit());

/* ------------------------------------------------------------------ fichiers */
ipcMain.handle('open-dialog', async (_e, opts = {}) => {
  const props = opts.directory ? ['openDirectory'] : ['openFile', ...(opts.multi === false ? [] : ['multiSelections'])];
  const r = await dialog.showOpenDialog(win, { title: opts.title || 'Ouvrir', defaultPath: opts.defaultPath, properties: props, filters: opts.filters });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('save-dialog', async (_e, opts = {}) => {
  const r = await dialog.showSaveDialog(win, { title: opts.title || 'Enregistrer sous', defaultPath: opts.defaultPath, filters: opts.filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('read-text', (_e, p) => {
  try { return { ok: true, text: fs.readFileSync(p, 'utf8') }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('write-file', (_e, p, data) => {
  try {
    const tmp = p + '.kctmp';
    fs.writeFileSync(tmp, typeof data === 'string' ? data : Buffer.from(data));
    fs.renameSync(tmp, p);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('exists', (_e, p) => { try { return fs.existsSync(p); } catch { return false; } });
ipcMain.handle('stat', (_e, p) => { try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs, dir: s.isDirectory() }; } catch { return null; } });

ipcMain.handle('list-dir', async (_e, dir) => {
  try {
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const d of ents) {
      if (d.name.startsWith('$') || d.name === 'System Volume Information') continue;
      const p = path.join(dir, d.name);
      let size = 0, mtime = 0, isDir = d.isDirectory();
      if (!isDir) { try { const s = await fs.promises.stat(p); size = s.size; mtime = s.mtimeMs; } catch { continue; } }
      out.push({ name: d.name, path: p, dir: isDir, size, mtime });
    }
    return { ok: true, entries: out };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('places', () => {
  const home = os.homedir();
  const drives = [];
  for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { fs.accessSync(d); drives.push(d); } catch { /* absent */ } }
  const safe = k => { try { return app.getPath(k); } catch { return null; } };
  return {
    home, drives,
    special: [
      ['Bureau', safe('desktop')], ['Vidéos', safe('videos')], ['Musique', safe('music')],
      ['Images', safe('pictures')], ['Téléchargements', safe('downloads')], ['Documents', safe('documents')],
    ].filter(x => x[1]),
  };
});

ipcMain.handle('get-pending', () => pending.splice(0));
ipcMain.handle('user-data', () => app.getPath('userData'));
ipcMain.handle('default-dir', () => { try { return app.getPath('videos'); } catch { return os.homedir(); } });

/* ------------------------------------------------------------------ dossier temporaire de rendu */
ipcMain.handle('temp-dir', () => {
  const d = path.join(app.getPath('temp'), 'KaneClip', 'job-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(d, { recursive: true });
  return d;
});
ipcMain.handle('remove-dir', (_e, d) => {
  try {
    if (!d || !d.startsWith(path.join(app.getPath('temp'), 'KaneClip'))) return false;
    fs.rmSync(d, { recursive: true, force: true });
    return true;
  } catch { return false; }
});

/* ------------------------------------------------------------------ ffmpeg */
ipcMain.handle('ff-available', async () => ({ path: tools.findFfmpeg(), version: tools.findFfmpeg() ? await tools.version() : null }));
ipcMain.handle('probe', (_e, p) => tools.probe(p));
ipcMain.handle('waveform', (_e, p) => tools.waveform(p));
ipcMain.handle('thumbs', (_e, p, d) => tools.thumbs(p, d));
ipcMain.handle('job-start', (_e, job) => tools.jobStart(job));
ipcMain.handle('job-cancel', (_e, id) => tools.jobCancel(id));
ipcMain.handle('proxy-path', (_e, p) => { const q = tools.proxyPath(p); return q && fs.existsSync(q) ? q : null; });
ipcMain.handle('proxy-start', (_e, p, info) => tools.proxyStart(p, info));
ipcMain.handle('keyint', (_e, p) => tools.keyInterval(p));
ipcMain.handle('encoders', () => tools.encoders());
ipcMain.handle('ai-status', () => ({ installed: ai.installed(), size: ai.size }));
ipcMain.handle('ai-install', e => ai.install(e));
ipcMain.handle('ai-start', (_e, o) => ai.start(o));
ipcMain.handle('ai-cancel', (_e, id) => ai.cancel(id));
ipcMain.handle('cache-size', () => {
  let total = 0;
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { total += fs.statSync(p).size; } catch { /* ignore */ } } } };
  walk(tools.cacheRoot());
  return total;
});
ipcMain.handle('cache-clear', () => { try { fs.rmSync(tools.cacheRoot(), { recursive: true, force: true }); return true; } catch { return false; } });

/* ------------------------------------------------------------------ sauvegarde automatique */
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.kcp');
ipcMain.handle('autosave-write', (_e, text) => { try { fs.writeFileSync(autosaveFile(), text); return true; } catch { return false; } });
ipcMain.handle('autosave-read', () => { try { const s = fs.statSync(autosaveFile()); return { text: fs.readFileSync(autosaveFile(), 'utf8'), mtime: s.mtimeMs }; } catch { return null; } });
ipcMain.handle('autosave-clear', () => { try { fs.unlinkSync(autosaveFile()); } catch { /* absent */ } return true; });

/* ------------------------------------------------------------------ polices */
ipcMain.handle('list-fonts', () => new Promise(resolve => {
  const keys = ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'];
  const names = new Set();
  let left = keys.length;
  for (const k of keys) {
    execFile('reg', ['query', k], { windowsHide: true, maxBuffer: 8 << 20 }, (_err, out) => {
      for (const line of String(out || '').split(/\r?\n/)) {
        const m = line.match(/^\s{4}(.+?)\s+REG_SZ\s/);
        if (!m) continue;
        const n = m[1].replace(/\s*\((TrueType|OpenType|All res)\)\s*$/i, '');
        for (const part of n.split('&')) {
          const f = part.trim()
            .replace(/\b(Bold|Italic|Oblique|Light|Semilight|SemiLight|Semibold|SemiBold|Black|Medium|Thin|ExtraLight|ExtraBold|Heavy|Regular|Condensed|Narrow|Demibold|Book|Variable|Display|Text)\b/g, '')
            .replace(/\s+/g, ' ').trim();
          if (f && !/^\d/.test(f) && f.length > 1) names.add(f);
        }
      }
      if (--left === 0) resolve([...names].sort((a, b) => a.localeCompare(b)));
    });
  }
}));

/* ------------------------------------------------------------------ fenêtre */
ipcMain.on('confirm-close', () => { allowClose = true; if (win) win.close(); });
ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.on('set-titlebar', (_e, o) => { try { if (win) win.setTitleBarOverlay(o); } catch { /* ancien Windows */ } });
ipcMain.on('toggle-devtools', () => { if (win) win.webContents.toggleDevTools(); });
ipcMain.on('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.on('open-path', (_e, p) => { shell.openPath(p); });
