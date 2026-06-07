import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader } from "../../src/api-loader";
import { ApiUpdater } from "../../src/api-updater";
import { getApiInfo } from "../../src/tools/get-api-info";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "api.fixture.json");
const MOCK_CACHE_DIR = "/tmp/mock-cache";

function makeUpdater(): ApiUpdater {
  return new ApiUpdater({ cacheDir: MOCK_CACHE_DIR });
}

// ── degraded mode (no loader) ─────────────────────────────────────────────

describe("getApiInfo — degraded mode", () => {
  it("degraded is true when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.degraded).toBe(true);
  });

  it("loaded is false when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.loaded).toBe(false);
  });

  it("indexReady is false when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.indexReady).toBe(false);
  });

  it("typeCount is 0 when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.typeCount).toBe(0);
  });

  it("apiDate is undefined when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.apiDate).toBeUndefined();
  });

  it("namespaces is empty array when no loader is provided", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.namespaces).toEqual([]);
  });
});

// ── loader present but not yet indexed ───────────────────────────────────

describe("getApiInfo — loader present, indexReady: false", () => {
  it("loaded is true, indexReady is false before load() completes", () => {
    const loader = new ApiLoader();
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.loaded).toBe(true);
    expect(result.indexReady).toBe(false);
    expect(result.degraded).toBe(false);
  });

  it("namespaces is empty while indexReady is false", () => {
    const loader = new ApiLoader();
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.namespaces).toEqual([]);
  });
});

// ── fully loaded mode ─────────────────────────────────────────────────────

describe("getApiInfo — fully loaded", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("loaded and indexReady are true, degraded is false", () => {
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.loaded).toBe(true);
    expect(result.indexReady).toBe(true);
    expect(result.degraded).toBe(false);
  });

  it("typeCount matches fixture size", () => {
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.typeCount).toBe(10);
  });

  it("apiDate is undefined when fixture filename has no timestamp", () => {
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.apiDate).toBeUndefined();
  });

  it("apiDate is populated when loader was loaded from a timestamped file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-api-info-test-"));
    const tsFile = path.join(tmpDir, "2026-06-05-18-09-57.zip.json");
    fs.copyFileSync(FIXTURE_PATH, tsFile);
    const tsLoader = new ApiLoader();
    await tsLoader.load(tsFile);
    const result = getApiInfo({ loader: tsLoader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.apiDate).toBe("2026-06-05-18-09-57");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("namespaces array is populated and sorted alphabetically", () => {
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.namespaces.length).toBeGreaterThan(0);
    const names = result.namespaces.map((n) => n.namespace);
    expect(names).toEqual([...names].sort());
  });

  it("namespaces contains correct counts from fixture", () => {
    const result = getApiInfo({ loader, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    const nsMap = Object.fromEntries(result.namespaces.map((n) => [n.namespace, n.count]));
    expect(nsMap["Sandbox"]).toBe(6);
    expect(nsMap["Sandbox.UI"]).toBe(1);
    expect(nsMap["Sandbox.Physics"]).toBe(1);
  });
});

// ── updater and flags ─────────────────────────────────────────────────────

describe("getApiInfo — updater and flags", () => {
  it("cacheDir reflects the updater's configured directory", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.cacheDir).toBe(MOCK_CACHE_DIR);
  });

  it("updateAvailable: true when passed true", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: true, debugMode: false });
    expect(result.updateAvailable).toBe(true);
  });

  it("updateAvailable: false when passed false", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.updateAvailable).toBe(false);
  });

  it("debugMode: true when passed true", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: true });
    expect(result.debugMode).toBe(true);
  });

  it("debugMode: false when passed false", () => {
    const result = getApiInfo({ loader: undefined, updater: makeUpdater(), updateAvailable: false, debugMode: false });
    expect(result.debugMode).toBe(false);
  });
});
