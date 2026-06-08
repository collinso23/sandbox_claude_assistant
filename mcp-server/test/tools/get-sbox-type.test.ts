import * as path from "path";
import { ApiLoader } from "../../src/api-loader";
import { getSboxType, MAX_NAME_LENGTH } from "../../src/tools/get-sbox-type";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "api.fixture.json");

// ── Degraded / no loader ──────────────────────────────────────────────────────

describe("getSboxType — degraded mode", () => {
  it("returns undefined when loader is undefined", () => {
    expect(getSboxType({ loader: undefined }, "Component")).toBeUndefined();
  });

  it("returns undefined when loader is present but indexReady is false", () => {
    const loader = new ApiLoader();
    expect(getSboxType({ loader }, "Component")).toBeUndefined();
  });
});

// ── Name validation ───────────────────────────────────────────────────────────

describe("getSboxType — name validation", () => {
  it("throws when name contains a null byte", () => {
    expect(() => getSboxType({ loader: undefined }, "bad\0name")).toThrow(/null bytes/);
  });

  it("throws when name exceeds MAX_NAME_LENGTH", () => {
    const long = "a".repeat(MAX_NAME_LENGTH + 1);
    expect(() => getSboxType({ loader: undefined }, long)).toThrow(/exceeds/);
  });
});

// ── Not found ─────────────────────────────────────────────────────────────────

describe("getSboxType — not found", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("returns undefined for an unknown type name", () => {
    expect(getSboxType({ loader }, "NoSuchType")).toBeUndefined();
  });

  it("returns undefined for an empty string without throwing", () => {
    expect(getSboxType({ loader }, "")).toBeUndefined();
  });
});

// ── FullName lookup ───────────────────────────────────────────────────────────

describe("getSboxType — exact FullName lookup", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("returns Sandbox.Camera when looking up by its full name", () => {
    const result = getSboxType({ loader }, "Sandbox.Camera");
    expect(result?.type?.FullName).toBe("Sandbox.Camera");
  });

  it("returns Sandbox.Render.Camera when looking up by its full name", () => {
    const result = getSboxType({ loader }, "Sandbox.Render.Camera");
    expect(result?.type?.FullName).toBe("Sandbox.Render.Camera");
  });
});

// ── Disambiguation ────────────────────────────────────────────────────────────

describe("getSboxType — disambiguation", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("returns types array of length 2 when name matches both Camera types", () => {
    const result = getSboxType({ loader }, "Camera");
    expect(result?.types).toBeDefined();
    expect(result?.types).toHaveLength(2);
  });

  it("disambiguation note contains both FullNames", () => {
    const result = getSboxType({ loader }, "Camera");
    expect(result?.note).toContain("Sandbox.Camera");
    expect(result?.note).toContain("Sandbox.Render.Camera");
  });

  it("disambiguation note does not embed raw user input", () => {
    // The note is built from API FullNames, not the caller's name string.
    // Verify by checking a name that differs from the FullName content.
    const result = getSboxType({ loader }, "Camera");
    // The note should mention specific FullNames but not just "Camera" as a standalone word
    // (it appears only as part of "Sandbox.Camera", never as a raw user-echo)
    expect(result?.note).not.toMatch(/^Camera\b/);
    expect(result?.note).not.toContain("'Camera'");
  });
});

// ── Normal mode ───────────────────────────────────────────────────────────────

describe("getSboxType — normal mode", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("Component: Documentation.Summary is present and Remarks is absent", () => {
    const result = getSboxType({ loader }, "Component");
    expect(result?.type?.Documentation?.Summary).toBeDefined();
    expect(result?.type?.Documentation?.Remarks).toBeUndefined();
  });

  it("Component: Methods are present without Documentation", () => {
    const result = getSboxType({ loader }, "Component");
    expect(result?.type?.Methods?.length).toBeGreaterThan(0);
    expect(result?.type?.Methods![0].Documentation).toBeUndefined();
  });

  it("Component: Properties are present without Documentation", () => {
    const result = getSboxType({ loader }, "Component");
    expect(result?.type?.Properties?.length).toBeGreaterThan(0);
    expect(result?.type?.Properties![0].Documentation).toBeUndefined();
  });

  it("Component: Constructors are present without Documentation", () => {
    const result = getSboxType({ loader }, "Component");
    expect(result?.type?.Constructors?.length).toBeGreaterThan(0);
    expect(result?.type?.Constructors![0].Documentation).toBeUndefined();
  });

  it("NetworkMode: Fields are present without Documentation", () => {
    const result = getSboxType({ loader }, "NetworkMode");
    expect(result?.type?.Fields?.length).toBeGreaterThan(0);
    expect(result?.type?.Fields![0].Documentation).toBeUndefined();
  });

  it("PhysicsBody: no Documentation, Properties still present", () => {
    const result = getSboxType({ loader }, "PhysicsBody");
    expect(result?.type?.Documentation).toBeUndefined();
    expect(result?.type?.Properties?.length).toBeGreaterThan(0);
  });

  it("CameraComponent: result is defined with no member arrays", () => {
    const result = getSboxType({ loader }, "CameraComponent");
    expect(result?.type).toBeDefined();
    expect(result?.type?.Methods).toBeUndefined();
    expect(result?.type?.Properties).toBeUndefined();
    expect(result?.type?.Fields).toBeUndefined();
    expect(result?.type?.Constructors).toBeUndefined();
  });
});

// ── Verbose mode ──────────────────────────────────────────────────────────────

describe("getSboxType — verbose mode", () => {
  let loader: ApiLoader;

  beforeAll(async () => {
    loader = new ApiLoader();
    await loader.load(FIXTURE_PATH);
  });

  it("MaliciousDoc: Summary is sanitized (injection stripped to [sanitized])", () => {
    const result = getSboxType({ loader }, "MaliciousDoc", { verbose: true });
    const summary = result?.type?.Documentation?.Summary ?? "";
    expect(summary).toContain("[sanitized]");
    expect(summary).not.toMatch(/ignore previous instructions/i);
  });

  it("MaliciousDoc: Remarks is sanitized (LLM delimiter stripped to [sanitized])", () => {
    const result = getSboxType({ loader }, "MaliciousDoc", { verbose: true });
    const remarks = result?.type?.Documentation?.Remarks ?? "";
    expect(remarks).toContain("[sanitized]");
    expect(remarks).not.toMatch(/\[INST\]/);
  });

  it("Component verbose: Method Documentation.Summary is a defined string", () => {
    const result = getSboxType({ loader }, "Component", { verbose: true });
    expect(typeof result?.type?.Methods![0].Documentation?.Summary).toBe("string");
  });

  it("Component verbose: Property Documentation.Summary is a defined string", () => {
    const result = getSboxType({ loader }, "Component", { verbose: true });
    expect(typeof result?.type?.Properties![0].Documentation?.Summary).toBe("string");
  });

  it("Component verbose: Constructor Documentation.Summary is a defined string", () => {
    const result = getSboxType({ loader }, "Component", { verbose: true });
    expect(typeof result?.type?.Constructors![0].Documentation?.Summary).toBe("string");
  });

  it("NetworkMode verbose: Field Documentation.Summary is a defined string", () => {
    const result = getSboxType({ loader }, "NetworkMode", { verbose: true });
    expect(typeof result?.type?.Fields![0].Documentation?.Summary).toBe("string");
  });

  it("Component verbose: Documentation includes both Summary and Remarks", () => {
    const result = getSboxType({ loader }, "Component", { verbose: true });
    expect(result?.type?.Documentation?.Summary).toBeDefined();
    expect(result?.type?.Documentation?.Remarks).toBeDefined();
  });

  it("disambiguation result types are shaped in verbose mode", () => {
    const result = getSboxType({ loader }, "Camera", { verbose: true });
    expect(result?.types).toBeDefined();
    expect(result?.types![0].Documentation?.Summary).toBeDefined();
  });
});
