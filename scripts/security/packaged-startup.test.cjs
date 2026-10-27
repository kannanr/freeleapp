const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const policy = require('../../packages/desktop-app/electron/security-policy.ts');

// Exercise the real main-process ready handler without launching Electron, a renderer,
// migrations, credential APIs or OS processes. Packagers remove package.json's build field.
function packagedStartup(metadata) {
  const listeners = new Map();
  const noop = () => {};
  const app = {
    isPackaged: true,
    disableHardwareAcceleration: noop,
    getPath: () => '/synthetic-freeleapp-home',
    on: (event, callback) => listeners.set(event, callback),
    requestSingleInstanceLock: () => true,
  };
  class Window {
    constructor() {
      this.webContents = {
        on: noop, once: noop, setWindowOpenHandler: noop,
        session: { setPermissionRequestHandler: noop, setPermissionCheckHandler: noop },
      };
    }
    setMenuBarVisibility() {}
    removeMenu() {}
    setMenu() {}
    loadURL() {}
    center() {}
    setMinimumSize() {}
    on() {}
  }
  let updateFeedCalls = 0;
  const modules = {
    './context-menu': { contextMenu: noop },
    './legacy-data-migration': { migrateLegacyData: () => ({ reason: 'synthetic-no-migration' }) },
    './security-policy': policy,
    path,
    url: require('node:url'),
    electron: { app, BrowserWindow: Window, ipcMain: { on: noop }, Tray: class {}, Menu: {}, systemPreferences: {} },
    'electron-localshortcut': { register: noop, unregisterAll: noop },
    'electron-updater': { autoUpdater: { setFeedURL: () => { updateFeedCalls++; } } },
    'electron-log': { transports: { file: {} }, info: noop },
    '@electron/remote/main': { initialize: noop, enable: noop },
    '../../../package.json': metadata,
  };
  const source = fs.readFileSync(path.join(__dirname, '../../packages/desktop-app/electron/main.ts'), 'utf8');
  const importsAsRequires = source
    .replace(/^import \{([^}]+)\} from "([^"]+)";/gm, 'const {$1} = require("$2");')
    .replace(/^import \* as (\w+) from "([^"]+)";/gm, 'const $1 = require("$2");');
  const javascript = stripTypeScriptTypes(importsAsRequires);
  vm.runInNewContext(javascript, {
    require(name) {
      if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected runtime dependency in startup test: ${name}`);
      return modules[name];
    },
    process: { platform: 'darwin', env: {} },
    __dirname: '/synthetic-freeleapp/electron/dist/electron',
    console: { log: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop,
  });
  listeners.get('ready')();
  return updateFeedCalls;
}

test('packaged startup works when electron-builder strips build metadata', () => {
  assert.equal(packagedStartup({ security: { autoUpdatesEnabled: false } }), 0);
});

test('missing or upstream feed metadata remains fail-closed even if updates are enabled', () => {
  assert.equal(packagedStartup({ security: { autoUpdatesEnabled: true } }), 0);
  assert.equal(packagedStartup({
    security: { autoUpdatesEnabled: true },
    build: { publish: [{ owner: 'sergioarojasm98', repo: 'freeleapp' }] },
  }), 0);
});
