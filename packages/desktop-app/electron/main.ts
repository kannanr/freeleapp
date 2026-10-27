import { contextMenu } from "./context-menu";
import { migrateLegacyData } from "./legacy-data-migration";
import { hardenPrivilegedWindow, isTrustedRendererEvent } from "./security-policy";
import * as path from "path";

const { app, BrowserWindow, ipcMain, Tray, Menu, systemPreferences } = require("electron");
const electronLocalshortcut = require('electron-localshortcut');
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

const url = require("url");
const ipc = ipcMain;

const remote = require("@electron/remote/main");
remote.initialize();

contextMenu({
  showInspectElement: false,
  showLookUpSelection: false,
  showSearchWithGoogle: false
});

app.disableHardwareAcceleration();

if (process.platform === "linux") {
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("in-process-gpu");
}


// Main Window configuration: set here the options to make it works with your app
// Electron is the application wrapper so NOT log is prompted when we build an
// application, we need to log to a file instead
const windowDefaultConfig = {
  dir: path.join(__dirname, `/../../../dist/leapp-client`),
  browserWindow: {
    width: 1200,
    height: 680,
    title: ``,
    icon: path.join(__dirname, `assets/images/Leapp.png`),
    resizable: true,
    webPreferences: {
      // Angular's file replacements do not apply to the separately compiled main process.
      devTools: !app.isPackaged,
      contextIsolation: false,
      nodeIntegration: true
    },
  },
};
const appEntryUrl = url.pathToFileURL(path.join(windowDefaultConfig.dir, "index.html")).href;
if (process.platform !== "win32") {
  windowDefaultConfig.browserWindow["titleBarStyle"] = "hidden";
  windowDefaultConfig.browserWindow["titleBarOverlay"] = true;
} else {
  windowDefaultConfig.browserWindow["titleBarStyle"] = "hidden";
  Menu.setApplicationMenu(null);
}

if (process.platform === "darwin") {
  windowDefaultConfig.browserWindow["trafficLightPosition"] = { x: 20, y: 20 };
}

// Main-process events go to the renderer's log file (same paths as AppService)
const logDirs = {
  darwin: path.join(app.getPath("home"), "Library/Logs/Freeleapp"),
  win32: path.join(app.getPath("home"), "AppData/Roaming/Freeleapp"),
};
log.transports.file.resolvePath = () =>
  path.join(logDirs[process.platform] || path.join(app.getPath("home"), ".config/Freeleapp/logs"), "log.electronService.log");
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}";

// Set by the Update button: the window closes for real (sessions are stopped first) and the updater quits the app
let installingUpdate = false;

const buildAutoUpdater = (win: any): void => {
  // A fork must never silently replace its security patches with an upstream release.
  // Enable only after this fork has its own independently verified signed releases.
  const metadata = require("../../../package.json");
  const feed = metadata.build.publish[0];
  if (!app.isPackaged || metadata.security?.autoUpdatesEnabled !== true || feed.owner !== "kannanr" || feed.repo !== "freeleapp") {
    log.info("[AUTO-UPDATER] Disabled pending audited, signed fork releases");
    return;
  }
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Downloads start below, depending on the Automatically Download Updates setting sent by the renderer
  autoUpdater.autoDownload = false;

  const minutes = 10;

  autoUpdater.setFeedURL({ provider: "github", owner: feed.owner, repo: feed.repo });

  let autoDownload: boolean | undefined;
  let availableVersion: string | undefined;
  let downloadedVersion: string | undefined;
  let downloading = false;

  const checkForUpdates = (label: string) => {
    autoUpdater.checkForUpdates().then((_) => {
      console.log(`[AUTO-UPDATER] ${label} update check completed`);
    }).catch((error) => {
      console.log(`[AUTO-UPDATER] ${label} update check failed:`, error);
    });
  };

  const downloadUpdate = () => {
    if (downloading || !availableVersion || availableVersion === downloadedVersion) {
      return;
    }
    downloading = true;
    autoUpdater.downloadUpdate().catch((error) => {
      console.log("[AUTO-UPDATER] Download failed:", error);
    }).finally(() => {
      downloading = false;
    });
  };

  // Sent once the workspace is loaded and again when the setting changes; the first one starts the checks
  ipc.on("UPDATER_SETTINGS", (event, settings) => {
    if (!isTrustedRendererEvent(event, win.webContents, appEntryUrl) || typeof settings?.autoDownload !== "boolean") {
      return;
    }
    const firstSettings = autoDownload === undefined;
    autoDownload = !!settings?.autoDownload;
    if (firstSettings) {
      checkForUpdates("Initial");
      setInterval(() => checkForUpdates("Periodic"), 1000 * 60 * minutes);
    } else if (autoDownload) {
      downloadUpdate();
    }
    // Sent again by a reloaded renderer, which no longer knows about the downloaded update
    if (downloadedVersion) {
      win.webContents.send("UPDATE_DOWNLOADED", { version: downloadedVersion });
    }
  });

  ipc.on("INSTALL_UPDATE", (event) => {
    if (!isTrustedRendererEvent(event, win.webContents, appEntryUrl) || !downloadedVersion) {
      return;
    }
    console.log("[AUTO-UPDATER] Installing", downloadedVersion);
    installingUpdate = true;
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AUTO-UPDATER] Update available:", info);
    availableVersion = info.version;
    if (autoDownload) {
      downloadUpdate();
    } else {
      win.webContents.send("UPDATE_AVAILABLE", info);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AUTO-UPDATER] Update downloaded:", info.version);
    if (info.version !== downloadedVersion) {
      downloadedVersion = info.version;
      win.webContents.send("UPDATE_DOWNLOADED", { version: info.version });
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[AUTO-UPDATER] Update not available:", info);
  });

  autoUpdater.on("error", (err) => {
    console.log("[AUTO-UPDATER] Error:", err);
  });

  autoUpdater.on("checking-for-update", () => {
    console.log("[AUTO-UPDATER] Checking for updates...");
  });
};

// Generate the main Electron window
const generateMainWindow = () => {
  if (process.platform === "linux" && ["Pantheon", "Unity:Unity7"].indexOf(process.env.XDG_CURRENT_DESKTOP) !== -1) {
    process.env.XDG_CURRENT_DESKTOP = "Unity";
  }

  let win;
  let forceQuit = false;
  let taskbar;
  let trayOpen = false;
  let trayWin;

  const createWindow = () => {
    // Generate the App Window
    win = new BrowserWindow({ ...windowDefaultConfig.browserWindow });
    hardenPrivilegedWindow(win, appEntryUrl);
    win.setMenuBarVisibility(false); // Hide Window Menu to make it compliant with MacOSX
    win.removeMenu(); // Remove Window Menu inside App, to make it compliant with Linux
    win.setMenu(null);
    win.loadURL(url.format({ pathname: windowDefaultConfig.dir + "/index.html", protocol: "file:", slashes: true }));
    win.center();

    // Small enough for window managers such as Rectangle (halves, thirds); the layout adapts below 900px
    win.setMinimumSize(560, 480);

    // A dead renderer leaves a white window and stops the SSO renewals; load the app again (it starts like a
    // relaunch: sessions stopped). At most 3 times in 5 minutes, so a renderer that keeps crashing doesn't loop.
    const rendererReloads: number[] = [];
    win.webContents.on("render-process-gone", (_, details) => {
      log.error(`[RENDERER] Process gone: ${details.reason} (exit code ${details.exitCode})`);
      if (forceQuit || installingUpdate || win.isDestroyed()) {
        return;
      }
      const now = Date.now();
      while (rendererReloads.length && now - rendererReloads[0] > 5 * 60 * 1000) {
        rendererReloads.shift();
      }
      if (rendererReloads.length >= 3) {
        log.error("[RENDERER] Gone 3 times in 5 minutes, not reloading again; quit and open Freeleapp");
        return;
      }
      rendererReloads.push(now);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          log.info("[RENDERER] Reloading the window");
          // index.html, not reload(): the router leaves file:///.../dashboard as the current URL
          win.loadURL(url.format({ pathname: windowDefaultConfig.dir + "/index.html", protocol: "file:", slashes: true }));
        }
      }, 1000);
    });
    win.webContents.on("unresponsive", () => log.warn("[RENDERER] Window is not responding"));
    win.webContents.on("responsive", () => log.info("[RENDERER] Window is responding again"));

    // Open the dev tools only if not in production
    if (!app.isPackaged) {
      // Open web tools for diagnostics
      win.webContents.once("dom-ready", () => {});
    }

    win.on("close", (event) => {
      event.preventDefault();
      if (!forceQuit && !installingUpdate) {
        win.hide();
      } else {
        win.webContents.send("app-close");
      }
    });

    // The hidden title bar is drawn by the app, so double-clicks are forwarded from the renderer and
    // handled like the native one, following System Settings > Desktop & Dock > "Double-click a window's title bar"
    ipc.on("title-bar-double-click", (evt) => {
      if (!isTrustedRendererEvent(evt, win.webContents, appEntryUrl)) {
        return;
      }
      const action = systemPreferences.getUserDefault("AppleActionOnDoubleClick", "string");
      if (action === "Minimize" || (!action && systemPreferences.getUserDefault("AppleMiniaturizeOnDoubleClick", "boolean"))) {
        win.minimize();
      } else if (action !== "None") {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      }
    });

    ipc.on("closed", (event) => {
      if (!isTrustedRendererEvent(event, win.webContents, appEntryUrl)) {
        return;
      }
      win.destroy();
      if (installingUpdate) {
        // quitAndInstall continues once every window is closed; quit anyway if it never does
        setTimeout(() => app.quit(), 15000);
        return;
      }
      app.quit();
    });

    app.on("browser-window-focus", () => {
      electronLocalshortcut.register(win, ['CommandOrControl+R', 'CommandOrControl+Shift+R', 'F5'], () => {});
    });

    app.on("browser-window-focus", () => {
      electronLocalshortcut.register(win, ['CommandOrControl+A'], () => {
        win.webContents.send("select-all");
      });
    });

    app.on("browser-window-blur", () => {
      electronLocalshortcut.unregisterAll(win);
    });

    remote.enable(win.webContents);
  };

  const createTrayWindow = () => {
    // Generate the App Window
    const opts = { ...windowDefaultConfig.browserWindow, frame: false };
    opts["titleBarStyle"] = "CustomOnHover";
    opts["titleBarOverlay"] = true;
    opts["minimizable"] = false;
    opts["maximizable"] = false;
    opts["closable"] = false;

    trayWin = new BrowserWindow(opts);
    hardenPrivilegedWindow(trayWin, appEntryUrl);
    trayWin.setMenuBarVisibility(false); // Hide Window Menu to make it compliant with MacOSX
    trayWin.removeMenu(); // Remove Window Menu inside App, to make it compliant with Linux
    trayWin.setMenu(null);
    trayWin.loadURL(url.format({ pathname: windowDefaultConfig.dir + "/index.html", protocol: "file:", slashes: true }));

    const taskbarWidth = 362;
    const taskbarHeight = 480;

    // Set position of taskbar
    // Need to be modified to accommodate for various scenarios
    trayWin.setPosition(taskbar.getBounds().x - taskbarWidth + taskbar.getBounds().width, taskbar.getBounds().y + taskbar.getBounds().height);

    // Set new minimum windows for opened tool.
    trayWin.setMinimumSize(taskbarWidth, taskbarHeight);
    trayWin.setSize(taskbarWidth, taskbarHeight);

    // Open the dev tools only if not in production
    if (!app.isPackaged) {
      // Open web tools for diagnostics
      trayWin.webContents.once("dom-ready", () => {});
    }

    remote.enable(trayWin.webContents);
  };

  const createTray = () => {
    if (!taskbar) {
      taskbar = new Tray(windowDefaultConfig.dir + `/assets/images/LeappTemplate.png`);
      taskbar.setToolTip("Freeleapp");
      taskbar.on("click", () => {
        trayOpen = !trayOpen;
        if (trayOpen) {
          // open
          createTrayWindow();
        } else {
          // close
          if (trayWin) {
            trayWin.setClosable(true);
            trayWin.close();
            trayWin = null;
          }
        }
      });
    }
  };

  app.on("activate", () => {
    if (win === undefined) {
      createWindow();
      require("electron-disable-file-drop");
    } else {
      win.show();
    }
  });

  app.on("before-quit", () => {
    forceQuit = true;
  });

  app.on("ready", () => {
    // Must run before the window loads: the renderer reads the configuration on startup
    try {
      console.log("[MIGRATION]", migrateLegacyData().reason);
    } catch (err) {
      console.log("[MIGRATION] Could not copy ~/.Leapp to ~/.freeleapp:", err);
    }
    createWindow();
    // createTray();
    buildAutoUpdater(win);

  });

  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      // Someone tried to run a second instance, we should focus our window.
      if (win) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.show();
        win.focus();
      }
    });
  }
  if (process.platform === "win32") {
    app.setAppUserModelId("io.github.kannanr.freeleapp");
  }
};
// =============================== //
// Start the real application HERE //
// =============================== //
generateMainWindow();
