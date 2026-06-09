import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiUpdater } from "../src/api-updater";
import { runUpdate, TOOL_DEFINITIONS } from "../src/index";

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

// ── TOOL_DEFINITIONS — schema correctness ────────────────────────────────

describe("TOOL_DEFINITIONS — schema correctness", () => {
  const EXPECTED_NAMES = [
    "search_sbox_api",
    "get_sbox_type",
    "list_namespaces",
    "search_gotchas",
    "get_api_info",
  ];

  it("defines exactly 5 tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("contains all expected tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    for (const expected of EXPECTED_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it("every tool has a non-empty description", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("every tool inputSchema has type 'object' and a properties key", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema).toHaveProperty("properties");
    }
  });

  it("search_sbox_api and get_sbox_type have the expected required fields", () => {
    const searchApi = TOOL_DEFINITIONS.find((t) => t.name === "search_sbox_api")!;
    const getSboxType = TOOL_DEFINITIONS.find((t) => t.name === "get_sbox_type")!;
    expect(searchApi.inputSchema.required).toEqual(["query"]);
    expect(getSboxType.inputSchema.required).toEqual(["name"]);
  });

  it("list_namespaces, search_gotchas, get_api_info have empty required arrays", () => {
    const noArgTools = ["list_namespaces", "search_gotchas", "get_api_info"];
    for (const toolName of noArgTools) {
      const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName)!;
      expect(tool.inputSchema.required).toEqual([]);
    }
  });
});

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
