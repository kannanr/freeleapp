import { TestBed } from "@angular/core/testing";

import { UpdaterService } from "./updater.service";
import { mustInjected } from "../../base-injectables";

describe("UpdaterService", () => {
  let service: UpdaterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [].concat(mustInjected()),
    });
    service = TestBed.inject(UpdaterService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("renders bundled notes without making a network request", async () => {
    const readFileSync = jasmine.createSpy("readFileSync").and.returnValue({ toString: () => "# Installed release" });
    const local = new UpdaterService(null, { fs: { readFileSync } } as any, null, { behaviouralSubjectService: {} } as any);
    expect(await local.getReleaseNote()).toContain("Installed release");
    expect(readFileSync.calls.mostRecent().args[0]).toContain("CHANGELOG.md");
  });

  it("does not fetch remote notes when bundled notes are unavailable", async () => {
    const local = new UpdaterService(
      null,
      {
        fs: {
          readFileSync: () => {
            throw new Error("missing");
          },
        },
      } as any,
      null,
      { behaviouralSubjectService: {} } as any
    );
    expect(await local.getInstalledReleaseNote()).toBe("");
  });
});
