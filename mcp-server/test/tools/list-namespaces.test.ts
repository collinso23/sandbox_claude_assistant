import * as path from "path";
import { ApiLoader } from "../../src/api-loader";
import { listNamespaces } from "../../src/tools/list-namespaces";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "api.fixture.json");

// ── Degraded / no loader ──────────────────────────────────────────────────────

describe("listNamespaces — degraded mode", () => {
  it("returns [] when loader is undefined", () => {
    expect(listNamespaces({ loader: undefined })).toEqual([]);
  });

  it("returns [] when loader is present but indexReady is false", () => {
    const loader = new ApiLoader();
    expect(listNamespaces({ loader })).toEqual([]);
  });
});

// ── Gate: all namespaces present ──────────────────────────────────────────────

describe("listNamespaces — gate: namespace presence", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("returns all 5 fixture namespaces in sorted order", () => {
    const result = listNamespaces({ loader });
    expect(result.map((e) => e.namespace)).toEqual([
      "Sandbox",
      "Sandbox.Physics",
      "Sandbox.Render",
      "Sandbox.Test",
      "Sandbox.UI",
    ]);
  });
});

// ── Gate: correct type counts ─────────────────────────────────────────────────

describe("listNamespaces — gate: type counts", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("Sandbox has typeCount 6 (Component, GameObject, IPressable, NetworkMode, Camera, CameraComponent)", () => {
    const result = listNamespaces({ loader });
    const sandbox = result.find((e) => e.namespace === "Sandbox");
    expect(sandbox?.typeCount).toBe(6);
  });

  it("each non-root namespace has typeCount 1", () => {
    const result = listNamespaces({ loader });
    const others = result.filter((e) => e.namespace !== "Sandbox");
    expect(others).toHaveLength(4);
    expect(others.every((e) => e.typeCount === 1)).toBe(true);
  });
});

// ── Gate: sorted output ───────────────────────────────────────────────────────

describe("listNamespaces — gate: sorted output", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("first entry is Sandbox (alphabetically earliest)", () => {
    const result = listNamespaces({ loader });
    expect(result[0].namespace).toBe("Sandbox");
  });

  it("last entry is Sandbox.UI (alphabetically last)", () => {
    const result = listNamespaces({ loader });
    expect(result[result.length - 1].namespace).toBe("Sandbox.UI");
  });
});

// ── Coverage: caching path ────────────────────────────────────────────────────

describe("listNamespaces — caching path", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("calling the tool twice returns identical results (getNamespaces cache hit exercised)", () => {
    const first = listNamespaces({ loader });
    const second = listNamespaces({ loader });
    expect(second).toEqual(first);
  });
});
