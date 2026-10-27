import { WindowService } from "./window.service";

describe("WindowService security boundaries", () => {
  let service: WindowService;
  let native: any;
  let options: any;
  let handlers: any;
  let popup: any;

  beforeEach(() => {
    handlers = {};
    native = {
      os: { platform: () => "darwin" },
      shell: { openExternal: jasmine.createSpy("openExternal") },
      browserWindow: class {
        webContents = {
          on: (name, handler) => (handlers[name] = handler),
          setWindowOpenHandler: (handler) => (popup = handler),
          session: { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {} },
        };
        constructor(opts) {
          options = opts;
        }
        setMenuBarVisibility() {}
        removeMenu() {}
        setMenu() {}
      },
    };
    service = new WindowService(null, native, null);
  });

  it("opens only HTTPS links in the system browser", () => {
    service.openExternalUrl("https://example.com");
    expect(native.shell.openExternal).toHaveBeenCalledWith("https://example.com");
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "http://example.com", "https://user:password@example.com"]) {
      expect(() => service.openExternalUrl(url)).toThrow();
    }
    expect(native.shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it("sandboxes authentication windows without Node or remote APIs", () => {
    service.newWindow("https://idp.example.com", true);
    expect(options.webPreferences).toEqual(
      jasmine.objectContaining({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      })
    );
    expect(popup({ url: "https://evil.test" })).toEqual({ action: "deny" });
    for (const name of ["will-navigate", "will-redirect"]) {
      const event = { preventDefault: jasmine.createSpy("preventDefault") };
      handlers[name](event, "file:///etc/passwd");
      expect(event.preventDefault).toHaveBeenCalled();
    }
  });

  it("rejects unsafe authentication URLs before creating a window", () => {
    expect(() => service.newWindow("http://idp.example.com", true)).toThrow();
  });
});
