import * as path from "path";
import { ApiLoader } from "../../src/api-loader";
import { searchSboxApi, MAX_QUERY_LENGTH } from "../../src/tools/search-api";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "api.fixture.json");

// ── Degraded / no loader ───────────────────────────────────────────────────

describe("searchSboxApi — degraded mode", () => {
  it("returns [] when loader is undefined", () => {
    expect(searchSboxApi({ loader: undefined }, "WorldPanel")).toEqual([]);
  });

  it("returns [] when loader is present but indexReady is false", () => {
    const loader = new ApiLoader();
    expect(searchSboxApi({ loader }, "WorldPanel")).toEqual([]);
  });
});

// ── Query validation ───────────────────────────────────────────────────────

describe("searchSboxApi — query validation", () => {
  it("throws when query contains a null byte", () => {
    expect(() => searchSboxApi({ loader: undefined }, "bad\0query")).toThrow(/null bytes/);
  });

  it("throws when query exceeds MAX_QUERY_LENGTH", () => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 1);
    expect(() => searchSboxApi({ loader: undefined }, long)).toThrow(/exceeds/);
  });

  it("empty query returns [] without throwing", () => {
    const loader = new ApiLoader();
    expect(searchSboxApi({ loader }, "")).toEqual([]);
  });
});

// ── Gate tests ────────────────────────────────────────────────────────────

describe("searchSboxApi — gate tests", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it('"WorldPanel" returns Sandbox.UI.WorldPanel first', () => {
    const results = searchSboxApi({ loader }, "WorldPanel");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].FullName).toBe("Sandbox.UI.WorldPanel");
  });

  it('"Camera.Main" returns zero results', () => {
    expect(searchSboxApi({ loader }, "Camera.Main")).toEqual([]);
  });
});

// ── Namespace filter ───────────────────────────────────────────────────────

describe("searchSboxApi — namespace filter", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it('"Camera" without namespace returns results from multiple namespaces', () => {
    const results = searchSboxApi({ loader }, "Camera");
    const namespaces = new Set(results.map((r) => r.Namespace));
    expect(namespaces.size).toBeGreaterThan(1);
  });

  it('"Camera" with namespace="Sandbox" returns only Sandbox entries', () => {
    const results = searchSboxApi({ loader }, "Camera", { namespace: "Sandbox" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.Namespace === "Sandbox")).toBe(true);
  });

  it('"Camera" with namespace="Sandbox.UI" returns []', () => {
    expect(searchSboxApi({ loader }, "Camera", { namespace: "Sandbox.UI" })).toEqual([]);
  });
});

// ── Normal mode ────────────────────────────────────────────────────────────

describe("searchSboxApi — normal mode (default)", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("WorldPanel result has no Documentation.Remarks", () => {
    const results = searchSboxApi({ loader }, "WorldPanel");
    expect(results[0].Documentation?.Remarks).toBeUndefined();
  });

  it("WorldPanel Methods are present without Documentation", () => {
    // WorldPanel has no Methods in fixture — use Component which has Methods
    const results = searchSboxApi({ loader }, "Component");
    const comp = results.find((r) => r.FullName === "Sandbox.Component");
    expect(comp).toBeDefined();
    expect(comp!.Methods?.length).toBeGreaterThan(0);
    expect(comp!.Methods![0].Documentation).toBeUndefined();
  });

  it("Component Properties are present without Documentation", () => {
    const results = searchSboxApi({ loader }, "Component");
    const comp = results.find((r) => r.FullName === "Sandbox.Component");
    expect(comp!.Properties?.length).toBeGreaterThan(0);
    expect(comp!.Properties![0].Documentation).toBeUndefined();
  });

  it("WorldPanel Documentation.Summary is present in normal mode", () => {
    const results = searchSboxApi({ loader }, "WorldPanel");
    expect(results[0].Documentation?.Summary).toBeDefined();
    expect(typeof results[0].Documentation?.Summary).toBe("string");
  });

  it("NetworkMode Fields are present without Documentation in normal mode", () => {
    const results = searchSboxApi({ loader }, "NetworkMode");
    const nm = results.find((r) => r.FullName === "Sandbox.NetworkMode");
    expect(nm).toBeDefined();
    expect(nm!.Fields?.length).toBeGreaterThan(0);
    expect(nm!.Fields![0].Documentation).toBeUndefined();
  });
});

// ── Verbose mode ──────────────────────────────────────────────────────────

describe("searchSboxApi — verbose mode", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("WorldPanel verbose result includes Documentation.Remarks", () => {
    const results = searchSboxApi({ loader }, "WorldPanel", { verbose: true });
    expect(results[0].Documentation?.Remarks).toBeDefined();
  });

  it("MaliciousDoc verbose result has sanitized Summary", () => {
    const results = searchSboxApi({ loader }, "MaliciousDoc", { verbose: true });
    expect(results.length).toBeGreaterThan(0);
    const doc = results[0].Documentation?.Summary ?? "";
    expect(doc).not.toMatch(/ignore previous instructions/i);
    expect(doc).toContain("[sanitized]");
  });

  it("MaliciousDoc verbose result has sanitized Remarks", () => {
    const results = searchSboxApi({ loader }, "MaliciousDoc", { verbose: true });
    const remarks = results[0].Documentation?.Remarks ?? "";
    expect(remarks).not.toMatch(/\[INST\]/);
    expect(remarks).toContain("[sanitized]");
  });

  it("Component verbose result includes Method Documentation", () => {
    const results = searchSboxApi({ loader }, "Component", { verbose: true });
    const comp = results.find((r) => r.FullName === "Sandbox.Component");
    expect(comp).toBeDefined();
    expect(comp!.Methods?.some((m) => m.Documentation !== undefined)).toBe(true);
  });

  it("NetworkMode verbose result includes Field Documentation", () => {
    const results = searchSboxApi({ loader }, "NetworkMode", { verbose: true });
    const nm = results.find((r) => r.FullName === "Sandbox.NetworkMode");
    expect(nm).toBeDefined();
    expect(nm!.Fields?.length).toBeGreaterThan(0);
    expect(nm!.Fields![0].Documentation?.Summary).toBeDefined();
  });
});
