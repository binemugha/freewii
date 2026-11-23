'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');

const port = Number(process.env.PORT) || 8443;
let mainWindow;
let relay;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function fail(title, message) {
  dialog.showErrorBox(title, message);
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#e4eaf1',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`https://localhost:${port}/`).catch((err) => {
    fail('FreeWii could not open', err.message);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
    const origin = new URL(url);
    if (origin.hostname === 'localhost' && Number(origin.port || 443) === port) {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });

  app.whenReady().then(() => {
    process.env.NO_OPEN = '1';
    process.env.FREEWII_CERT_DIR = path.join(app.getPath('userData'), 'certs');

    try {
      relay = require('../server');
    } catch (err) {
      fail('FreeWii could not start', err.message);
      return;
    }

    relay.server.once('error', (err) => {
      const message = err.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Close the other FreeWii server or app, then try again.`
        : err.message;
      fail('FreeWii could not start its game server', message);
    });

    if (relay.server.listening) createWindow();
    else relay.server.once('listening', createWindow);
  }).catch((err) => fail('FreeWii could not start', err.message));

  app.on('activate', () => {
    if (!mainWindow && relay?.server.listening) createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => relay?.io.close());
}
