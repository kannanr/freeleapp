const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const home = process.env.FREELEAPP_UI_FIXTURE_HOME;
if (!home || process.env.HOME !== home || !fs.existsSync(path.join(home, '.ui-fixture-only'))) {
  throw new Error('UI fixture refuses to run without an isolated, marked HOME');
}
app.setPath('userData', path.join(home, 'electron-profile'));
app.commandLine.appendSwitch('use-mock-keychain');
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('remote-debugging-port', process.env.FREELEAPP_UI_PORT);
const remote = require(path.join(root, 'packages/desktop-app/node_modules/@electron/remote/main'));
remote.initialize();
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  remote.enable(win.webContents);
  const appRoot = process.env.FREELEAPP_UI_ASAR || path.join(root, 'packages/desktop-app');
  win.loadFile(path.join(appRoot, 'dist/leapp-client/index.html'));
});
app.on('window-all-closed', () => app.quit());
