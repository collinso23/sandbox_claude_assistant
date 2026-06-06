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
});
