import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader } from "../src/api-loader";
import { ApiUpdater } from "../src/api-updater";
import { loadProjectGotchas } from "../src/project-gotchas";
import {
  initialize,
  runBackgroundCheck,
  handleToolCall,
  ServerState,
} from "../src/server";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "api.fixture.json");

// ── Temp file helpers ─────────────────────────────────────────────────────

const tmpPaths: string[] = [];
const ORIGINAL_ENV = process.env["SBOX_API_JSON"];

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) process.env["SBOX_API_JSON"] = ORIGINAL_ENV;
  else delete process.env["SBOX_API_JSON"];
});

afterAll(() => {
  for (const p of tmpPaths) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
});

function makeTempDir(): string {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "sbox-server-test-"));
  tmpPaths.push(p);
  return p;
}

function makeTempLog(): string {
  const p = path.join(os.tmpdir(), `sbox-server-test-log-${Date.now()}-${Math.random()}.log`);
  tmpPaths.push(p);
  return p;
}

function makeTempCacheWithFixture(): string {
  const dir = makeTempDir();
  fs.copyFileSync(FIXTURE_PATH, path.join(dir, "2026-06-07-00-00-00.zip.json"));
  return dir;
}

// ── initialize — degraded, no debug ──────────────────────────────────────

describe("initialize — degraded, no debug", () => {
  it("returns loader:undefined and writes stderr WARNING when no API file exists", async () => {
    delete process.env["SBOX_API_JSON"];
    const stderrSpy = { write: jest.fn() };
    const state = await initialize({ cacheDir: makeTempDir(), stderr: stderrSpy });
    expect(state.loader).toBeUndefined();
    expect(stderrSpy.write).toHaveBeenCalledTimes(1);
    expect(stderrSpy.write.mock.calls[0][0]).toContain("WARNING");
  });
});

// ── initialize — degraded, with debug ────────────────────────────────────

describe("initialize — degraded, with debug", () => {
  it("writes stderr warning and debug log when no API file exists and --debug is set", async () => {
    delete process.env["SBOX_API_JSON"];
    const stderrSpy = { write: jest.fn() };
    const logPath = makeTempLog();
    const state = await initialize({
      cacheDir: makeTempDir(),
      args: ["--debug"],
      logPath,
      stderr: stderrSpy,
    });
    expect(state.loader).toBeUndefined();
    expect(stderrSpy.write).toHaveBeenCalledTimes(1);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toContain("degraded");
  });
});

// ── initialize — loaded, no debug ────────────────────────────────────────

describe("initialize — loaded, no debug", () => {
  it("returns ready loader and does not write a log file when API file is present", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    const logPath = makeTempLog();
    const stderrSpy = { write: jest.fn() };
    const state = await initialize({ args: [], logPath, stderr: stderrSpy });
    expect(state.loader).toBeDefined();
    expect(state.loader!.indexReady).toBe(true);
    expect(stderrSpy.write).not.toHaveBeenCalled();
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

// ── initialize — loaded, with debug ──────────────────────────────────────

describe("initialize — loaded, with debug", () => {
  it("writes log containing type count and elapsed ms when --debug is set", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    const logPath = makeTempLog();
    const stderrSpy = { write: jest.fn() };
    await initialize({ args: ["--debug"], logPath, stderr: stderrSpy });
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toContain("types");
    expect(log).toContain("ms");
  });
});

// ── initialize — async ordering invariant ────────────────────────────────

describe("initialize — async ordering invariant", () => {
  it("indexReady is true synchronously after initialize() resolves (load is fully awaited)", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    const state = await initialize({ args: [], stderr: { write: jest.fn() } });
    expect(state.loader!.indexReady).toBe(true);
  });
});

// ── initialize — projectGotchas ───────────────────────────────────────────

describe("initialize — projectGotchas", () => {
  it("returns empty projectGotchas when projectRoot has no .claude/gotchas.json", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    const state = await initialize({
      args: [],
      projectRoot: makeTempDir(),
      stderr: { write: jest.fn() },
    });
    expect(state.projectGotchas).toEqual([]);
  });
});

// ── initialize — default-arg and ?? branches ──────────────────────────────

describe("initialize — default-arg and ?? branches", () => {
  it("works with no config argument at all (default = {} branch)", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    // No stderr arg → hits process.stderr ?? branch; loaded path → write() never called
    const state = await initialize();
    expect(state.loader!.indexReady).toBe(true);
  });

  it("accepts a fetch override in config (config.fetch !== undefined branch)", async () => {
    process.env["SBOX_API_JSON"] = FIXTURE_PATH;
    const mockFetch = jest.fn();
    const state = await initialize({ args: [], fetch: mockFetch, stderr: { write: jest.fn() } });
    expect(state.loader!.indexReady).toBe(true);
    // fetch is passed to updater but initialize itself never calls checkForUpdate
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── runBackgroundCheck ────────────────────────────────────────────────────

describe("runBackgroundCheck", () => {
  it("resolves without throwing when fetch rejects (offline-first)", async () => {
    const updater = new ApiUpdater({
      fetch: () => Promise.reject(new Error("network failure")),
    });
    await expect(
      runBackgroundCheck(updater, undefined, jest.fn(), false, makeTempLog())
    ).resolves.toBeUndefined();
  });

  it("calls onResult(true) and writes log when update is available and debugMode is true", async () => {
    const updater = new ApiUpdater();
    jest.spyOn(updater, "checkForUpdate").mockResolvedValue({
      updateAvailable: true,
      latestTimestamp: "2026-06-08-00-00-00",
      currentTimestamp: "2026-01-01-00-00-00",
      downloadUrl: "https://cdn.sbox.game/releases/2026-06-08-00-00-00.zip.json",
    });
    const logPath = makeTempLog();
    const onResult = jest.fn();
    await runBackgroundCheck(updater, "2026-01-01-00-00-00", onResult, true, logPath);
    expect(onResult).toHaveBeenCalledWith(true);
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toContain("Update available");
  });

  it("calls onResult(false) and writes no log when update is not available", async () => {
    const updater = new ApiUpdater();
    jest.spyOn(updater, "checkForUpdate").mockResolvedValue({
      updateAvailable: false,
      latestTimestamp: "2026-01-01-00-00-00",
      currentTimestamp: "2026-01-01-00-00-00",
      downloadUrl: undefined,
    });
    const logPath = makeTempLog();
    const onResult = jest.fn();
    await runBackgroundCheck(updater, "2026-01-01-00-00-00", onResult, false, logPath);
    expect(onResult).toHaveBeenCalledWith(false);
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

// ── handleToolCall — degraded guard ──────────────────────────────────────

describe("handleToolCall — degraded guard", () => {
  const degradedState: ServerState = {
    loader: undefined,
    updater: new ApiUpdater({ cacheDir: os.tmpdir() }),
    debugMode: false,
    projectGotchas: [],
  };

  it("returns warning JSON for an API tool when loader is absent", async () => {
    const result = await handleToolCall("search_sbox_api", { query: "Component" }, degradedState, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("warning");
    expect(parsed).toHaveProperty("result", null);
  });

  it("returns a results array for search_gotchas even when loader is absent", async () => {
    const result = await handleToolCall("search_gotchas", { query: "networking" }, degradedState, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ── handleToolCall — per tool, valid loader ───────────────────────────────

describe("handleToolCall — per tool, valid loader", () => {
  let state: ServerState;

  beforeAll(async () => {
    const loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
    const updater = new ApiUpdater({ cacheDir: makeTempDir() });
    const projectGotchas = await loadProjectGotchas(makeTempDir());
    state = { loader, updater, debugMode: false, projectGotchas };
  });

  it("search_sbox_api: returns array with WorldPanel as first result", async () => {
    const result = await handleToolCall("search_sbox_api", { query: "WorldPanel" }, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].FullName).toBe("Sandbox.UI.WorldPanel");
  });

  it("search_sbox_api: namespace string branch — filters to Sandbox.UI results", async () => {
    const result = await handleToolCall(
      "search_sbox_api",
      { query: "WorldPanel", namespace: "Sandbox.UI" },
      state,
      false
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].Namespace).toBe("Sandbox.UI");
  });

  it("search_sbox_api: missing query falls back to empty string (query ?? '' branch)", async () => {
    const result = await handleToolCall("search_sbox_api", {}, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("get_sbox_type: returns object with type.Name === Component", async () => {
    const result = await handleToolCall("get_sbox_type", { name: "Component" }, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("type");
    expect(parsed.type.Name).toBe("Component");
  });

  it("get_sbox_type: missing name falls back to empty string (name ?? '' branch)", async () => {
    const result = await handleToolCall("get_sbox_type", {}, state, false);
    // empty name → no match → null (not undefined, so response text is valid JSON)
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toBeNull();
  });

  it("list_namespaces: returns array of length 5", async () => {
    const result = await handleToolCall("list_namespaces", {}, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(5);
  });

  it("search_gotchas: returns a results array for query 'networking'", async () => {
    const result = await handleToolCall("search_gotchas", { query: "networking" }, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("search_gotchas: missing query falls back to empty string (query ?? '' branch)", async () => {
    const result = await handleToolCall("search_gotchas", {}, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("get_api_info: returns object with degraded === false", async () => {
    const result = await handleToolCall("get_api_info", {}, state, false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("degraded", false);
  });
});

// ── handleToolCall — unknown tool ─────────────────────────────────────────

describe("handleToolCall — unknown tool", () => {
  const state: ServerState = {
    loader: undefined,
    updater: new ApiUpdater({ cacheDir: os.tmpdir() }),
    debugMode: false,
    projectGotchas: [],
  };

  it("throws an error containing 'Unknown tool' for an unrecognized tool name", async () => {
    await expect(
      handleToolCall("nonexistent_tool", {}, state, false)
    ).rejects.toThrow("Unknown tool");
  });
});
