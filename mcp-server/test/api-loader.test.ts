import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader, LruCache } from "../src/api-loader";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "api.fixture.json");

// ── Temp file helpers ─────────────────────────────────────────────────────

const tmpFiles: string[] = [];

function writeTempJson(content: unknown): string {
  const p = path.join(os.tmpdir(), `api-loader-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(p, JSON.stringify(content));
  tmpFiles.push(p);
  return p;
}

function writeTempRaw(content: string): string {
  const p = path.join(os.tmpdir(), `api-loader-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(p, content);
  tmpFiles.push(p);
  return p;
}

function writeTempJsonNamed(filename: string, content: unknown): string {
  const p = path.join(os.tmpdir(), filename);
  fs.writeFileSync(p, JSON.stringify(content));
  tmpFiles.push(p);
  return p;
}

afterAll(() => {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
});

// ── LruCache — direct tests ───────────────────────────────────────────────

describe("LruCache", () => {
  it("get after set returns value", () => {
    const c = new LruCache<string, number>(10);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
  });

  it("get on missing key returns undefined", () => {
    const c = new LruCache<string, number>(10);
    expect(c.get("missing")).toBeUndefined();
  });

  it("evicts oldest entry when capacity is exceeded", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3); // a should be evicted
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
    expect(c.has("c")).toBe(true);
    expect(c.size).toBe(2);
  });

  it("get promotes key so it survives the next eviction", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // promote a → b is now oldest
    c.set("c", 3); // b should be evicted
    expect(c.has("b")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.has("c")).toBe(true);
  });

  it("has returns true and false correctly", () => {
    const c = new LruCache<string, number>(5);
    c.set("x", 42);
    expect(c.has("x")).toBe(true);
    expect(c.has("y")).toBe(false);
  });

  it("size reflects current entry count", () => {
    const c = new LruCache<string, number>(5);
    expect(c.size).toBe(0);
    c.set("a", 1);
    expect(c.size).toBe(1);
    c.set("b", 2);
    expect(c.size).toBe(2);
  });

  it("set on existing key updates the stored value without growing the cache", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("a", 99);
    expect(c.get("a")).toBe(99);
    expect(c.size).toBe(1);
  });

  it("set on existing key promotes it to survive the next eviction", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 1); // re-set a → b becomes oldest
    c.set("c", 3); // b should be evicted
    expect(c.has("b")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.has("c")).toBe(true);
  });

  it("maxSize=1 evicts on every new set", () => {
    const c = new LruCache<string, number>(1);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
    c.set("c", 3);
    expect(c.has("b")).toBe(false);
    expect(c.has("c")).toBe(true);
    expect(c.size).toBe(1);
  });
});

// ── ApiLoader — load and structure ────────────────────────────────────────

describe("ApiLoader — load and structure", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("indexReady is false before load()", () => {
    const fresh = new ApiLoader();
    expect(fresh.indexReady).toBe(false);
  });

  it("indexReady is true after load()", () => {
    expect(loader.indexReady).toBe(true);
  });

  it("typeCount equals fixture size (10)", () => {
    expect(loader.typeCount).toBe(10);
  });

  it("getByFullName returns correct type", () => {
    const type = loader.getByFullName("Sandbox.UI.WorldPanel");
    expect(type).toBeDefined();
    expect(type!.Name).toBe("WorldPanel");
    expect(type!.Namespace).toBe("Sandbox.UI");
  });

  it("getByFullName returns undefined for unknown FullName", () => {
    expect(loader.getByFullName("Nonexistent.Type")).toBeUndefined();
  });

  it("getByName returns multiple types for ambiguous name", () => {
    const types = loader.getByName("Camera");
    expect(types).toHaveLength(2);
    const namespaces = types.map((t) => t.Namespace);
    expect(namespaces).toContain("Sandbox");
    expect(namespaces).toContain("Sandbox.Render");
  });

  it("getByName returns single type for unambiguous name", () => {
    const types = loader.getByName("Component");
    expect(types).toHaveLength(1);
    expect(types[0].FullName).toBe("Sandbox.Component");
  });

  it("getByName returns empty array for unknown name", () => {
    expect(loader.getByName("NoSuchType")).toEqual([]);
  });

  it("apiDate is undefined when filename has no timestamp pattern", () => {
    expect(loader.apiDate).toBeUndefined();
  });

  it("apiDate is extracted from a timestamped filename", async () => {
    const minimalType = { Name: "X", FullName: "X.X", Namespace: "X", Group: "class", Assembly: "x", IsPublic: true, DocId: "T:X.X" };
    const p = writeTempJsonNamed("2026-06-05-18-09-57.zip.json", { Types: [minimalType] });
    const l = new ApiLoader();
    await l.load(p);
    expect(l.apiDate).toBe("2026-06-05-18-09-57");
  });
});

// ── ApiLoader — search gate ───────────────────────────────────────────────

describe("ApiLoader — search gate", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it('search("WorldPanel") returns Sandbox.UI.WorldPanel as first result', () => {
    const results = loader.search("WorldPanel");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].FullName).toBe("Sandbox.UI.WorldPanel");
  });

  it('search("Camera.Main") returns empty array', () => {
    expect(loader.search("Camera.Main")).toEqual([]);
  });

  it('search("Sandbox.UI.WorldPanel") returns WorldPanel via exact FullName', () => {
    const results = loader.search("Sandbox.UI.WorldPanel");
    expect(results).toHaveLength(1);
    expect(results[0].Name).toBe("WorldPanel");
  });

  it("returns [] before load() is called", () => {
    expect(new ApiLoader().search("Component")).toEqual([]);
  });

  it('search("Sandbox.Physics") returns PhysicsBody via dot-AND match', () => {
    const results = loader.search("Sandbox.Physics");
    expect(results).toHaveLength(1);
    expect(results[0].FullName).toBe("Sandbox.Physics.PhysicsBody");
  });

  it('search("WorldPanel", "Sandbox.UI") passes namespace filter', () => {
    const results = loader.search("WorldPanel", "Sandbox.UI");
    expect(results).toHaveLength(1);
    expect(results[0].FullName).toBe("Sandbox.UI.WorldPanel");
  });

  it('search("WorldPanel", "Sandbox") eliminates result that lives in Sandbox.UI', () => {
    expect(loader.search("WorldPanel", "Sandbox")).toEqual([]);
  });

  it('search("NoSuchType") returns []', () => {
    expect(loader.search("NoSuchType")).toEqual([]);
  });
});

// ── ApiLoader — namespaces ────────────────────────────────────────────────

describe("ApiLoader — namespaces", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("getNamespaces returns correct counts", () => {
    const ns = loader.getNamespaces();
    expect(ns.get("Sandbox")).toBe(6);       // Component, GameObject, IPressable, NetworkMode, Camera, CameraComponent
    expect(ns.get("Sandbox.UI")).toBe(1);    // WorldPanel
    expect(ns.get("Sandbox.Physics")).toBe(1); // PhysicsBody
    expect(ns.get("Sandbox.Render")).toBe(1);  // Camera
    expect(ns.get("Sandbox.Test")).toBe(1);    // MaliciousDoc
  });
});

// ── ApiLoader — LRU integration ───────────────────────────────────────────

describe("ApiLoader — LRU integration", () => {
  it("cacheSize stays at lruSize after accessing more types than the limit", async () => {
    const loader = new ApiLoader(2);
    await loader.load(FIXTURE_PATH);

    loader.getByFullName("Sandbox.Component");
    loader.getByFullName("Sandbox.GameObject");
    loader.getByFullName("Sandbox.UI.WorldPanel"); // third access evicts first

    expect(loader.cacheSize).toBe(2);
  });

  it("getByFullName returns the cached result on a repeated call", async () => {
    const loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);

    const first = loader.getByFullName("Sandbox.Component");
    const second = loader.getByFullName("Sandbox.Component"); // hits cache
    expect(second).toBeDefined();
    expect(second).toBe(first);
  });
});

// ── ApiLoader — validation ────────────────────────────────────────────────

describe("ApiLoader — validation", () => {
  it("throws when Types array is empty", async () => {
    const p = writeTempJson({ Types: [] });
    await expect(new ApiLoader().load(p)).rejects.toThrow("empty");
  });

  it("throws when a type entry is missing required fields", async () => {
    const p = writeTempJson({ Types: [{ Name: "Incomplete" }] });
    await expect(new ApiLoader().load(p)).rejects.toThrow();
  });

  it("throws on invalid JSON", async () => {
    const p = writeTempRaw("this is not json { broken");
    await expect(new ApiLoader().load(p)).rejects.toThrow();
  });

  it("throws when root is an array instead of an object", async () => {
    const p = writeTempJson([]);
    await expect(new ApiLoader().load(p)).rejects.toThrow();
  });

  it("throws when root is null", async () => {
    const p = writeTempRaw("null");
    await expect(new ApiLoader().load(p)).rejects.toThrow(/root is not an object/);
  });

  it("throws when a Types array entry is not an object", async () => {
    const p = writeTempRaw('{"Types":[null]}');
    await expect(new ApiLoader().load(p)).rejects.toThrow(/type entry is not an object/);
  });

  it("loads successfully and indexes correctly when a FullName contains a double dot", async () => {
    const minimalType = { Name: "Component", FullName: "Sandbox..Component", Namespace: "Sandbox", Group: "class", Assembly: "x", IsPublic: true, DocId: "T:Sandbox..Component" };
    const p = writeTempJson({ Types: [minimalType] });
    const loader = new ApiLoader();
    await loader.load(p);
    expect(loader.getByFullName("Sandbox..Component")).toBeDefined();
  });
});
