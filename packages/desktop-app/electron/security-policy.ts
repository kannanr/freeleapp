/** Only the bundled document may be loaded in a window that has Node access. */
export const isAppEntryUrl = (value: string, entryUrl: string): boolean => {
  try {
    const url = new URL(value);
    const entry = new URL(entryUrl);
    return url.protocol === "file:" && !url.host && url.pathname === entry.pathname && !url.search;
  } catch (_) {
    return false;
  }
};

/** Angular changes the document URL with pushState; all routes must remain under its bundled directory. */
export const isTrustedRendererEvent = (event: any, contents: any, entryUrl: string): boolean => {
  try {
    if (event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame) {
      return false;
    }
    const frame = new URL(event.senderFrame.url);
    const entry = new URL(entryUrl);
    const directory = decodeURIComponent(entry.pathname).slice(0, decodeURIComponent(entry.pathname).lastIndexOf("/") + 1);
    const pathname = decodeURIComponent(frame.pathname);
    return (
      frame.protocol === "file:" &&
      !frame.host &&
      pathname.startsWith(directory) &&
      !pathname.includes("\\") &&
      !pathname.split("/").some((segment) => segment === ".." || segment === ".")
    );
  } catch (_) {
    return false;
  }
};

export const hardenPrivilegedWindow = (win: any, entryUrl: string): void => {
  const contents = win.webContents;
  const stopNavigation = (event: any, destination: string) => {
    if (!isAppEntryUrl(destination, entryUrl)) {
      event.preventDefault();
    }
  };
  contents.on("will-navigate", stopNavigation);
  contents.on("will-redirect", stopNavigation);
  contents.on("will-attach-webview", (event: any) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.session.setPermissionRequestHandler((_contents: any, _permission: string, callback: any) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
};
