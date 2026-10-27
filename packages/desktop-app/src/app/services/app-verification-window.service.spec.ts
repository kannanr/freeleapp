import { AppVerificationWindowService } from "./app-verification-window.service";

describe("AppVerificationWindowService loopback security", () => {
  let originalRequire: any;
  let handler: any;
  let server: any;
  let service: any;

  beforeEach(() => {
    originalRequire = window.require;
    server = {
      close: jasmine.createSpy("close"),
      on: () => {},
      listen: (_port, _host, callback) => callback(),
      address: () => ({ port: 12345 }),
    };
    (window as any).require = (name: string) => {
      expect(name).toBe("http");
      return {
        createServer: (callback) => {
          handler = callback;
          return server;
        },
      };
    };
    service = new AppVerificationWindowService({ openExternalUrl: () => {} } as any, null, null);
  });

  afterEach(() => {
    window.require = originalRequire;
  });

  const response = () => ({ writeHead: jasmine.createSpy("writeHead"), end: jasmine.createSpy("end") });

  it("ignores a forged callback and still accepts the subsequent legitimate callback", async () => {
    const pending = service.waitForAuthorizationCode("us-east-1", "client", [], "expected-state", "challenge");
    const forged = response();
    handler({ method: "GET", url: "/oauth/callback?state=wrong&code=stolen", headers: { host: "127.0.0.1:12345" } }, forged);
    expect(forged.writeHead).toHaveBeenCalledWith(400, jasmine.any(Object));
    expect(server.close).not.toHaveBeenCalled();
    const accepted = response();
    handler({ method: "GET", url: "/oauth/callback?state=expected-state&code=valid", headers: { host: "127.0.0.1:12345" } }, accepted);
    expect(await pending).toEqual({ code: "valid", redirectUri: "http://127.0.0.1:12345/oauth/callback" });
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(accepted.writeHead).toHaveBeenCalledWith(
      200,
      jasmine.objectContaining({ ["Cache-Control"]: "no-store", ["Referrer-Policy"]: "no-referrer" })
    );
  });

  it("does not reflect OAuth error text into the callback page or error", async () => {
    const pending = service.waitForAuthorizationCode("us-east-1", "client", [], "expected-state", "challenge");
    const failed = response();
    handler({ method: "GET", url: "/oauth/callback?state=expected-state&error=secret-attacker-text", headers: { host: "127.0.0.1:12345" } }, failed);
    await expectAsync(pending).toBeRejectedWithError("AWS SSO sign-in was not authorized");
    expect(failed.end.calls.mostRecent().args[0]).not.toContain("secret-attacker-text");
  });
});
