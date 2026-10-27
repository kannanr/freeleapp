import { jest, describe, test, expect } from "@jest/globals";
import { ExecuteService } from "./execute-service";

describe("ExecuteService", () => {
  test("does not log command arguments or output containing credentials", async () => {
    const log = jest.fn();
    const nativeService = {
      exec: (_command, _options, callback) => callback(null, "fake-secret-token", "fake-secret-error"),
      process: { platform: "win32" },
    } as any;
    const service = new ExecuteService(nativeService, null, { log } as any);
    expect(await service.execute("az login --password fake-password")).toBe("fake-secret-token");
    const messages = log.mock.calls.map((call: any) => call[0].message).join("\n");
    expect(messages).not.toContain("fake-password");
    expect(messages).not.toContain("fake-secret-token");
    expect(messages).not.toContain("fake-secret-error");
  });

  test("sensitive command failures do not expose the command in the error message", async () => {
    const error: any = new Error("Command failed: fake-password");
    error.cmd = "az login --password fake-password";
    const nativeService = {
      exec: (_command, _options, callback) => callback(error, "fake-token", "fake-stderr"),
      process: { platform: "win32" },
    } as any;
    const service = new ExecuteService(nativeService, null, { log: jest.fn() } as any);
    await expect(service.execute("az login --password fake-password", undefined, true)).rejects.toThrow("sensitive output hidden");
    expect(error.cmd).toBeUndefined();
    expect(error.stack).not.toContain("fake-password");
    expect(error.stdout).toBe("****");
    expect(error.stderr).toBe("****");
  });

  test("execute, command without sudo, not darwin os", async () => {
    const nativeService = { exec: "fake-exec-fn", process: { platform: "win32" } } as any;
    const service = new ExecuteService(nativeService, null, null) as any;
    service.exec = jest.fn(async () => "fake-exec-result");

    const result = await service.execute("fake-command", "fake-env", "fake-maskOutputLog");

    expect(service.exec).toHaveBeenCalledWith("fake-exec-fn", "fake-command", "fake-env", "fake-maskOutputLog");
    expect(result).toBe("fake-exec-result");
  });

  test("execute, command with sudo, not darwin os", async () => {
    const nativeService = { exec: "fake-exec-fn", sudo: { exec: "fake-sudo-exec-fn" }, process: { platform: "win32" } } as any;
    const service = new ExecuteService(nativeService, null, null) as any;
    service.exec = jest.fn(async () => "fake-exec-result");

    const result = await service.execute("sudo fake-command", "fake-env", "fake-maskOutputLog");

    expect(service.exec).toHaveBeenCalledWith("fake-sudo-exec-fn", "fake-command", "fake-env", "fake-maskOutputLog");
    expect(result).toBe("fake-exec-result");
  });
});
