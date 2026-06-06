import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiUpdater, FetchFn } from "../src/api-updater";

// ── Helpers ───────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "api-updater-test-"));
  tmpDirs.push(p);
  return p;
}

function mockFetch(body: string, status = 200): FetchFn {
  return () => Promise.resolve(new Response(body, { status }));
}

function throwingFetch(message = "Network unreachable"): FetchFn {
  return () => Promise.reject(new Error(message));
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true }); } catch {}
  }
});

// ── getNewestCachedFile ───────────────────────────────────────────────────

describe("ApiUpdater.getNewestCachedFile", () => {
  it("returns undefined when directory is empty", () => {
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir });
    expect(u.getNewestCachedFile()).toEqual({ filePath: undefined, timestamp: undefined });
  });

  it("returns undefined when directory does not exist", () => {
    const u = new ApiUpdater({ cacheDir: path.join(os.tmpdir(), "no-such-dir-xyz") });
    expect(u.getNewestCachedFile()).toEqual({ filePath: undefined, timestamp: undefined });
  });

  it("returns the single file when one valid timestamp exists", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "2026-06-05-18-09-57.zip.json"), "");
    const u = new ApiUpdater({ cacheDir: dir });
    const result = u.getNewestCachedFile();
    expect(result.timestamp).toBe("2026-06-05-18-09-57");
    expect(result.filePath).toBe(path.join(dir, "2026-06-05-18-09-57.zip.json"));
  });

  it("returns the newest timestamp when multiple files exist", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "2026-06-01-10-00-00.zip.json"), "");
    fs.writeFileSync(path.join(dir, "2026-06-05-18-09-57.zip.json"), "");
    fs.writeFileSync(path.join(dir, "2026-05-20-08-00-00.zip.json"), "");
    const u = new ApiUpdater({ cacheDir: dir });
    expect(u.getNewestCachedFile().timestamp).toBe("2026-06-05-18-09-57");
  });

  it("returns undefined when only non-timestamp files exist", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "readme.txt"), "");
    fs.writeFileSync(path.join(dir, "notes.md"), "");
    const u = new ApiUpdater({ cacheDir: dir });
    expect(u.getNewestCachedFile()).toEqual({ filePath: undefined, timestamp: undefined });
  });

  it("ignores non-timestamp files and returns the timestamp file", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "readme.txt"), "");
    fs.writeFileSync(path.join(dir, "2026-06-05-18-09-57.zip.json"), "");
    const u = new ApiUpdater({ cacheDir: dir });
    expect(u.getNewestCachedFile().timestamp).toBe("2026-06-05-18-09-57");
  });
});

// ── checkForUpdate ────────────────────────────────────────────────────────

describe("ApiUpdater.checkForUpdate", () => {
  it("returns updateAvailable: true when CDN has a newer timestamp", async () => {
    const u = new ApiUpdater({
      fetch: mockFetch("2026-06-10-12-00-00.zip.json 2026-06-05-18-09-57.zip.json"),
    });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(true);
    expect(result.latestTimestamp).toBe("2026-06-10-12-00-00");
    expect(result.downloadUrl).toContain("2026-06-10-12-00-00.zip.json");
  });

  it("returns updateAvailable: false when CDN timestamp matches current", async () => {
    const u = new ApiUpdater({ fetch: mockFetch("2026-06-05-18-09-57.zip.json") });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("returns updateAvailable: false when CDN timestamp is older than current", async () => {
    const u = new ApiUpdater({ fetch: mockFetch("2026-05-01-00-00-00.zip.json") });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(false);
  });

  it("returns updateAvailable: true when no currentTimestamp is provided", async () => {
    const u = new ApiUpdater({ fetch: mockFetch("2026-06-05-18-09-57.zip.json") });
    const result = await u.checkForUpdate();
    expect(result.updateAvailable).toBe(true);
    expect(result.currentTimestamp).toBeUndefined();
  });

  it("returns updateAvailable: false without throwing when fetch throws (offline)", async () => {
    const u = new ApiUpdater({ fetch: throwingFetch() });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(false);
    expect(result.latestTimestamp).toBeUndefined();
  });

  it("returns updateAvailable: false without throwing when CDN returns HTTP 500", async () => {
    const u = new ApiUpdater({ fetch: mockFetch("Internal Server Error", 500) });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(false);
  });

  it("returns updateAvailable: false when CDN response contains no timestamps", async () => {
    const u = new ApiUpdater({ fetch: mockFetch("no timestamps here at all") });
    const result = await u.checkForUpdate("2026-06-05-18-09-57");
    expect(result.updateAvailable).toBe(false);
    expect(result.latestTimestamp).toBeUndefined();
  });
});

// ── resolveApiPath ────────────────────────────────────────────────────────

describe("ApiUpdater.resolveApiPath", () => {
  const ORIGINAL = process.env["SBOX_API_JSON"];
  afterEach(() => {
    if (ORIGINAL !== undefined) process.env["SBOX_API_JSON"] = ORIGINAL;
    else delete process.env["SBOX_API_JSON"];
  });

  it("returns env path with source 'env' when SBOX_API_JSON is set", () => {
    process.env["SBOX_API_JSON"] = "/custom/path/api.json";
    const u = new ApiUpdater({ cacheDir: path.join(os.tmpdir(), "no-such-dir-xyz") });
    const result = u.resolveApiPath();
    expect(result.filePath).toBe("/custom/path/api.json");
    expect(result.source).toBe("env");
  });

  it("returns cache path with source 'cache' when env is unset and cache has files", () => {
    delete process.env["SBOX_API_JSON"];
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "2026-06-05-18-09-57.zip.json"), "");
    const u = new ApiUpdater({ cacheDir: dir });
    const result = u.resolveApiPath();
    expect(result.filePath).toContain("2026-06-05-18-09-57");
    expect(result.source).toBe("cache");
  });

  it("returns undefined when env is unset and cache is empty", () => {
    delete process.env["SBOX_API_JSON"];
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir });
    expect(u.resolveApiPath()).toEqual({ filePath: undefined, source: undefined });
  });

  it("returns undefined when env is unset and cache dir does not exist", () => {
    delete process.env["SBOX_API_JSON"];
    const u = new ApiUpdater({ cacheDir: path.join(os.tmpdir(), "no-such-dir-xyz") });
    expect(u.resolveApiPath()).toEqual({ filePath: undefined, source: undefined });
  });
});

// ── downloadLatest ────────────────────────────────────────────────────────

describe("ApiUpdater.downloadLatest", () => {
  const TS = "2026-06-05-18-09-57";
  const CONTENT = JSON.stringify({ Types: [{ Name: "X", FullName: "X.X", Namespace: "X", Group: "class", Assembly: "x", IsPublic: true, DocId: "T:X.X" }] });

  it("writes file atomically and returns final path", async () => {
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir, fetch: mockFetch(CONTENT) });
    const returned = await u.downloadLatest(TS);
    const expected = path.join(dir, `${TS}.zip.json`);
    expect(returned).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    expect(fs.existsSync(`${expected}.tmp`)).toBe(false);
  });

  it("throws with URL and status when CDN returns non-OK status, leaves no .tmp", async () => {
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir, fetch: mockFetch("Not Found", 404) });
    await expect(u.downloadLatest(TS)).rejects.toThrow(/HTTP 404/);
    expect(fs.existsSync(path.join(dir, `${TS}.zip.json.tmp`))).toBe(false);
  });

  it("throws and leaves no .tmp when fetch throws", async () => {
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir, fetch: throwingFetch("ECONNREFUSED") });
    await expect(u.downloadLatest(TS)).rejects.toThrow();
    expect(fs.existsSync(path.join(dir, `${TS}.zip.json.tmp`))).toBe(false);
  });
});

// ── ensureCacheDir ────────────────────────────────────────────────────────

describe("ApiUpdater.ensureCacheDir", () => {
  it("creates the directory when it does not exist", async () => {
    const base = makeTempDir();
    const target = path.join(base, "sub", "cache");
    const u = new ApiUpdater({ cacheDir: target });
    await u.ensureCacheDir();
    expect(fs.existsSync(target)).toBe(true);
  });

  it("is idempotent when the directory already exists", async () => {
    const dir = makeTempDir();
    const u = new ApiUpdater({ cacheDir: dir });
    await expect(u.ensureCacheDir()).resolves.toBeUndefined();
    await expect(u.ensureCacheDir()).resolves.toBeUndefined();
  });
});

// ── getCacheDir ───────────────────────────────────────────────────────────

describe("ApiUpdater.getCacheDir", () => {
  it("returns the configured cache directory", () => {
    const u = new ApiUpdater({ cacheDir: "/custom/cache" });
    expect(u.getCacheDir()).toBe("/custom/cache");
  });

  it("default cache dir contains .sbox-claude/api-cache", () => {
    const u = new ApiUpdater();
    expect(u.getCacheDir()).toContain(path.join(".sbox-claude", "api-cache"));
  });
});
