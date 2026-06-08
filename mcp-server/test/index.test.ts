import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiUpdater } from "../src/api-updater";
import { runUpdate } from "../src/index";

// ── Temp helpers ──────────────────────────────────────────────────────────

const tmpPaths: string[] = [];

afterAll(() => {
  for (const p of tmpPaths) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
});

function makeTempDir(): string {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "sbox-index-test-"));
  tmpPaths.push(p);
  return p;
}

// ── runUpdate — cached timestamp regression (Scenario 8) ─────────────────

describe("runUpdate — cached timestamp passed to checkForUpdate", () => {
  it("passes the cached file's timestamp to checkForUpdate, not undefined", async () => {
    const cacheDir = makeTempDir();
    // Plant a fake cached file with a known timestamp in its filename
    const fakeTimestamp = "2026-01-01-00-00-00";
    fs.writeFileSync(path.join(cacheDir, `${fakeTimestamp}.zip.json`), "{}", "utf8");

    const updater = new ApiUpdater({ cacheDir });
    const spy = jest
      .spyOn(updater, "checkForUpdate")
      .mockResolvedValue({
        updateAvailable: false,
        latestTimestamp: fakeTimestamp,
        currentTimestamp: fakeTimestamp,
        downloadUrl: undefined,
      });

    await runUpdate(updater);

    // The critical assertion: checkForUpdate must be called WITH the timestamp,
    // not with undefined (the pre-fix bug).
    expect(spy).toHaveBeenCalledWith(fakeTimestamp);
    expect(spy).not.toHaveBeenCalledWith(undefined);
  });

  it("prints 'Already up to date.' when checkForUpdate returns no downloadUrl", async () => {
    const updater = new ApiUpdater({ cacheDir: makeTempDir() });
    jest.spyOn(updater, "checkForUpdate").mockResolvedValue({
      updateAvailable: false,
      latestTimestamp: "2026-01-01-00-00-00",
      currentTimestamp: "2026-01-01-00-00-00",
      downloadUrl: undefined,
    });

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runUpdate(updater);
      expect(logSpy).toHaveBeenCalledWith("Already up to date.");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("calls downloadLatest and prints 'Downloaded:' when checkForUpdate returns a downloadUrl", async () => {
    const cacheDir = makeTempDir();
    const updater = new ApiUpdater({ cacheDir });
    const fakeDownloadUrl = "https://cdn.sbox.game/releases/2026-06-01-12-00-00.zip.json";
    const fakeFilePath = path.join(cacheDir, "2026-06-01-12-00-00.zip.json");

    jest.spyOn(updater, "checkForUpdate").mockResolvedValue({
      updateAvailable: true,
      latestTimestamp: "2026-06-01-12-00-00",
      currentTimestamp: "2026-01-01-00-00-00",
      downloadUrl: fakeDownloadUrl,
    });
    jest.spyOn(updater, "ensureCacheDir").mockResolvedValue(undefined);
    jest.spyOn(updater, "downloadLatest").mockResolvedValue(fakeFilePath);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runUpdate(updater);
      expect(updater.downloadLatest).toHaveBeenCalledWith(fakeDownloadUrl);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Downloaded:"));
    } finally {
      logSpy.mockRestore();
    }
  });
});
