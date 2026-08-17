'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  shell,
  session,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { Agent } = require('./agent.cjs');

const isDev = !app.isPackaged;
const DEV_ORIGIN = `http://localhost:${process.env.DERMAGA_DEV_PORT || 3000}`;

// A .app launched from Finder inherits a bare PATH, which will not contain the
// `container` binary. Put the usual install locations back.
const EXTRA_PATH = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];

let mainWindow = null;
let splashWindow = null;
let agent = null;

/**
 * Windows open where the user is looking, not on whichever display macOS calls
 * primary. The display under the pointer is the best available guess, and it is
 * what every other Mac app does.
 */
function placeOn(width, height) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;

  // A window larger than the display it lands on would otherwise be pushed
  // off-screen.
  const fittedWidth = Math.min(width, area.width);
  const fittedHeight = Math.min(height, area.height);

  return {
    width: fittedWidth,
    height: fittedHeight,
    x: Math.round(area.x + (area.width - fittedWidth) / 2),
    y: Math.round(area.y + (area.height - fittedHeight) / 2),
  };
}

// Streams the startup sequence is listening to, keyed by stream id.
const streamListeners = new Map();

/** Runs a streaming agent method to completion, reporting each line. */
function runStream(method, params, onLine) {
  return new Promise((resolve, reject) => {
    agent
      .invoke(method, params)
      .then(({ streamId }) => {
        const lines = [];

        streamListeners.set(streamId, (event, payload) => {
          if (event === 'stream.data') {
            lines.push(payload.chunk);
            onLine?.(payload.chunk);
            return;
          }

          streamListeners.delete(streamId);

          if (payload.error) reject(new Error(payload.error));
          else resolve(lines);
        });
      })
      .catch(reject);
  });
}

// On a warm machine every step finishes in a few hundred milliseconds, and a
// splash that flashes past reads as a glitch rather than as progress. Hold it
// long enough to actually be read.
const MIN_SPLASH_MS = 2200;
const SPLASH_SETTLE_MS = 700;

// Startup takes a moment -- spawning the agent, asking the CLI where it stands
// -- and an empty window for that long looks broken. The splash says what is
// happening, and the main window is only revealed once there is something in it.
function createSplash() {
  splashWindow = new BrowserWindow({
    ...placeOn(380, 240),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'splash-preload.cjs'),
    },
  });

  splashWindow.once('ready-to-show', () => splashWindow?.show());
  void splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function splashStep(id, state, label) {
  splashWindow?.webContents.send('splash:step', { id, state, label });
}

/** Ends startup with an explanation the user can read, then closes the app. */
function splashFatal(title, detail) {
  splashWindow?.webContents.send('splash:fatal', { title, detail });

  // A backstop in case the window is left untouched; the Quit button is the
  // intended way out.
  setTimeout(() => app.quit(), 60000);
}

function closeSplash() {
  splashWindow?.close();
  splashWindow = null;
}

function agentBinary() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'dermaga-agent')]
    : [
        path.join(__dirname, '..', '..', 'bin', 'dermaga-agent'),
        path.join(__dirname, '..', 'resources', 'dermaga-agent'),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function startAgent() {
  const binary = agentBinary();

  if (!binary) {
    console.error('[dermaga] agent binary not found; run `make build-agent`');
    return;
  }

  const mergedPath = Array.from(
    new Set([...(process.env.PATH || '').split(':').filter(Boolean), ...EXTRA_PATH])
  ).join(':');

  agent = new Agent({
    binary,
    env: { ...process.env, PATH: mergedPath },
    // Everything the agent pushes -- snapshots, stream chunks, terminal output
    // -- is forwarded to the renderer as one channel.
    onNotify: (message) => {
      // Startup runs its own streams before any window exists to forward to.
      const params = message?.params;
      if (params?.id && streamListeners.has(params.id)) {
        streamListeners.get(params.id)(message.method, params);
      }

      mainWindow?.webContents.send('dermaga:notify', message);
    },
    onExit: (code) => console.warn('[dermaga] agent exited with code', code),
  });

  agent.start();
}

function applyContentSecurityPolicy() {
  if (isDev) return; // Vite's HMR client needs inline scripts and a websocket.

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // The renderer has no network access at all: everything goes over IPC.
        'Content-Security-Policy': [
          "default-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
        ],
      },
    });
  });
}

// A packaged build takes its icon from the bundle; in development the Dock
// would otherwise show Electron's own.
function applyDevIcon() {
  if (app.isPackaged || process.platform !== 'darwin') return;

  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(icon)) app.dock?.setIcon(icon);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    // The same display the splash opened on, since the pointer has not moved
    // far in the second it took to get here.
    ...placeOn(1180, 760),
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    // Avoids a white flash into a dark UI (and the reverse) on launch.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131317' : '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Shown by the startup sequence, once the renderer has something to draw.

  // A renderer crash used to show as an empty window with no explanation.
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      console.error(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[renderer] failed to load', url, description, code);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone:', details.reason);
  });

  // The traffic lights disappear in fullscreen, so the UI needs to know.
  const reportFullScreen = () =>
    mainWindow?.webContents.send('dermaga:fullscreen', mainWindow.isFullScreen());

  mainWindow.on('enter-full-screen', reportFullScreen);
  mainWindow.on('leave-full-screen', reportFullScreen);

  // External links open in the user's browser, never in the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_ORIGIN);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('dermaga:invoke', async (_event, method, params) => {
  if (!agent) throw new Error('The Dermaga agent is not running');
  return agent.invoke(method, params);
});

ipcMain.handle('dermaga:is-fullscreen', () => mainWindow?.isFullScreen() ?? false);

// --- updates --------------------------------------------------------------
//
// Releases are ad-hoc signed, and Squirrel refuses to swap an app whose
// signature it cannot match against the running one, so there is no silent
// self-update to be had. This is the honest version of it: fetch the release,
// download the DMG with progress, open it, and get out of the way so the user
// can drop the new build over the old one.

const UPDATE_REPO = 'ryanbekhen/dermaga';

/** True when `candidate` is a later version than `current`. */
function isNewer(candidate, current) {
  const parts = (value) =>
    String(value)
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const [a, b] = [parts(candidate), parts(current)];

  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }

  return false;
}

ipcMain.handle('dermaga:check-update', async () => {
  const current = app.getVersion();

  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Dermaga' },
  });

  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/, '');
  const asset = (release.assets || []).find((item) => item.name?.endsWith('.dmg'));

  if (!version || !asset || !isNewer(version, current)) {
    return { available: false, current };
  }

  return {
    available: true,
    current,
    version,
    url: release.html_url,
    assetUrl: asset.browser_download_url,
    size: asset.size ?? 0,
  };
});

ipcMain.handle('dermaga:download-update', async (_event, assetUrl, version) => {
  const response = await fetch(assetUrl);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);

  const total = Number(response.headers.get('content-length')) || 0;
  // Downloads, not a temp directory: if anything goes wrong the user still has
  // the installer where they would expect to find it.
  const target = path.join(app.getPath('downloads'), `Dermaga-${version}-arm64.dmg`);
  const file = fs.createWriteStream(target);

  let received = 0;

  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      file.write(chunk);
      mainWindow?.webContents.send('dermaga:update-progress', { received, total });
    }
  } catch (error) {
    file.destroy();
    fs.rmSync(target, { force: true });
    throw error;
  }

  await new Promise((resolve, reject) => {
    file.end(resolve);
    file.on('error', reject);
  });

  return target;
});

ipcMain.handle('dermaga:install-update', async (_event, dmgPath) => {
  const problem = await shell.openPath(dmgPath);
  if (problem) throw new Error(problem);

  // Quitting immediately would race Finder mounting the image, and the user
  // would be left staring at a closed app and no window.
  setTimeout(() => app.quit(), 1500);
});

// A build needs a directory on the user's disk, and the renderer is sandboxed
// with no filesystem access of its own. macOS grants access to whatever is
// chosen here, so no permission prompt of ours is involved.
ipcMain.handle('dermaga:pick-directory', async (_event, title) => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || 'Choose a folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Choose',
  });

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.on('splash:quit', () => app.quit());

/**
 * The splash is the bootstrap, not a progress bar over one. It checks each
 * prerequisite and fixes what it can: installing the CLI through Homebrew,
 * starting the services if they are down. Without Homebrew there is nothing it
 * can do, so it says so and the app closes rather than opening onto a UI that
 * cannot work.
 */
async function startUp() {
  const startedAt = Date.now();
  createSplash();

  // 1. The agent itself.
  splashStep('agent', 'active');
  startAgent();

  let toolchain;
  try {
    toolchain = await agent.invoke('toolchain.status');
    splashStep('agent', 'done');
  } catch (error) {
    console.error('[dermaga] agent did not answer:', error.message);
    splashFatal('The Dermaga agent did not start', error.message);
    return;
  }

  // 2. Homebrew, which everything else here depends on.
  splashStep('brew', 'active');
  if (!toolchain.brewAvailable) {
    splashFatal(
      'Homebrew is required',
      'Dermaga installs and updates Apple\u2019s container CLI through Homebrew. Install it from brew.sh, then open Dermaga again.'
    );
    return;
  }
  splashStep('brew', 'done', 'Homebrew found');

  // 3. The container CLI, installed here if it is missing.
  if (toolchain.installed) {
    splashStep('cli', 'done', `Container CLI ${toolchain.version || ''}`.trim());
  } else {
    splashStep('cli', 'active', 'Installing the container CLI\u2026');
    try {
      await runStream('toolchain.install', undefined, (line) => {
        const trimmed = line.trim();
        if (trimmed) splashStep('cli', 'active', trimmed.slice(0, 60));
      });
      splashStep('cli', 'done', 'Container CLI installed');
    } catch (error) {
      console.error('[dermaga] install failed:', error.message);
      splashFatal('Could not install the container CLI', error.message);
      return;
    }
  }

  // 4. The background services, started here if they are down.
  splashStep('services', 'active');
  try {
    const report = await agent.invoke('system.status');

    if (report?.status?.running) {
      splashStep('services', 'done', 'Services running');
    } else {
      splashStep('services', 'active', 'Starting services\u2026');
      // Kernel install stays opt-in: it downloads, and the app has a screen
      // that asks properly if this turns out to be why the start failed.
      await agent.invoke('system.start', { installKernel: false });
      splashStep('services', 'done', 'Services started');
    }
  } catch (error) {
    console.error('[dermaga] services did not start:', error.message);
    // Not fatal: the app opens on its own "services are down" screen, which
    // offers the fix. A fresh install almost always lands here for one reason,
    // so name it rather than leaving the user with "could not start".
    const kernelMissing = /kernel/i.test(error.message || '');
    splashStep(
      'services',
      'failed',
      kernelMissing ? 'A Linux kernel is needed' : 'Could not start services'
    );
  }

  // 5. The window itself.
  splashStep('ui', 'active');
  createWindow();

  await new Promise((resolve) => {
    // Whichever comes first: the renderer painting, or a timeout so a stuck
    // load cannot trap the user behind the splash.
    const timer = setTimeout(resolve, 8000);
    mainWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  splashStep('ui', 'done');

  // Let the last step register as complete, then hold the whole splash to its
  // minimum so a fast start still shows what happened.
  await new Promise((resolve) => setTimeout(resolve, SPLASH_SETTLE_MS));
  const remaining = MIN_SPLASH_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  closeSplash();
  mainWindow?.show();
}

app.whenReady().then(() => {
  applyContentSecurityPolicy();
  applyDevIcon();
  void startUp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Take the agent down with the app rather than leaving it orphaned.
app.on('before-quit', () => agent?.stop());
