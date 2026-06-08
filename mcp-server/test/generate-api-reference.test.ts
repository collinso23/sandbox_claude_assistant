import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader } from "../src/api-loader";
import { generate } from "../src/generate-api-reference";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "api.fixture.json");

// ── Temp file helpers ─────────────────────────────────────────────────────

const tmpPaths: string[] = [];

afterAll(() => {
  for (const p of tmpPaths) {
    try { fs.rmSync(p, { force: true }); } catch {}
  }
});

function makeTempOutput(): string {
  const p = path.join(os.tmpdir(), `sbox-ref-test-${Date.now()}-${Math.random()}.md`);
  tmpPaths.push(p);
  tmpPaths.push(`${p}.tmp`);
  return p;
}

// ── Shared loader ─────────────────────────────────────────────────────────

let loader: ApiLoader;

beforeAll(async () => {
  loader = new ApiLoader();
  await loader.load(FIXTURE_PATH);
});

// ── Header ────────────────────────────────────────────────────────────────

describe("generate — header", () => {
  it("output contains the main heading", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("# S&box API Reference");
  });

  it("output contains the API date comment", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("<!-- Generated from API");
    expect(content).toContain("do not edit -->");
  });
});

// ── Namespaces ────────────────────────────────────────────────────────────

describe("generate — namespaces", () => {
  let content: string;

  beforeAll(async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    content = fs.readFileSync(out, "utf8");
  });

  it("contains Sandbox namespace section", () => {
    expect(content).toContain("## Sandbox");
  });

  it("contains Sandbox.UI namespace section", () => {
    expect(content).toContain("## Sandbox.UI");
  });

  it("contains Sandbox.Physics namespace section", () => {
    expect(content).toContain("## Sandbox.Physics");
  });

  it("contains Sandbox.Render namespace section", () => {
    expect(content).toContain("## Sandbox.Render");
  });

  it("contains Sandbox.Test namespace section", () => {
    expect(content).toContain("## Sandbox.Test");
  });

  it("namespaces appear in alphabetical order", () => {
    const physicsPos = content.indexOf("## Sandbox.Physics");
    const renderPos = content.indexOf("## Sandbox.Render");
    const testPos = content.indexOf("## Sandbox.Test");
    const uiPos = content.indexOf("## Sandbox.UI");
    expect(physicsPos).toBeLessThan(renderPos);
    expect(renderPos).toBeLessThan(testPos);
    expect(testPos).toBeLessThan(uiPos);
  });
});

// ── Type presence ─────────────────────────────────────────────────────────

describe("generate — type presence", () => {
  let content: string;

  beforeAll(async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    content = fs.readFileSync(out, "utf8");
  });

  const expectedTypes = [
    "Component", "GameObject", "WorldPanel", "IPressable",
    "PhysicsBody", "NetworkMode", "Camera", "CameraComponent", "MaliciousDoc",
  ];

  for (const name of expectedTypes) {
    it(`contains type ${name}`, () => {
      expect(content).toContain(`### ${name}`);
    });
  }
});

// ── Sort order within namespace ───────────────────────────────────────────

describe("generate — sort order", () => {
  it("within Sandbox namespace, Camera appears before CameraComponent (FullName sort)", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const content = fs.readFileSync(out, "utf8");
    const cameraPos = content.indexOf("### Camera\n");
    const cameraComponentPos = content.indexOf("### CameraComponent");
    expect(cameraPos).toBeLessThan(cameraComponentPos);
  });
});

// ── No-doc types render cleanly ───────────────────────────────────────────

describe("generate — boundary: no docs", () => {
  it("output does not contain the string 'undefined'", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).not.toContain("undefined");
  });
});

// ── Determinism ───────────────────────────────────────────────────────────

describe("generate — determinism", () => {
  it("two consecutive runs produce byte-identical output", async () => {
    const out1 = makeTempOutput();
    const out2 = makeTempOutput();
    await generate(loader, out1);
    await generate(loader, out2);
    const content1 = fs.readFileSync(out1, "utf8");
    const content2 = fs.readFileSync(out2, "utf8");
    expect(content1).toBe(content2);
  });
});

// ── Atomic write ──────────────────────────────────────────────────────────

describe("generate — atomic write", () => {
  it(".tmp file does not exist after generate() completes", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    expect(fs.existsSync(`${out}.tmp`)).toBe(false);
  });

  it("output file exists and is non-empty after generate() completes", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const stat = fs.statSync(out);
    expect(stat.size).toBeGreaterThan(0);
  });
});

// ── Sanitizer applied ─────────────────────────────────────────────────────

describe("generate — sanitizer", () => {
  it("prompt-injection string from MaliciousDoc is replaced with [sanitized]", async () => {
    const out = makeTempOutput();
    await generate(loader, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("[sanitized]");
    expect(content).not.toContain("ignore all previous instructions");
  });
});

// ── Branch coverage: member edge cases ───────────────────────────────────
// These use inline loaders to exercise branches not reachable from the main fixture.

async function loaderFromTypes(types: unknown[]): Promise<ApiLoader> {
  const json = JSON.stringify({ Types: types });
  const tmpPath = path.join(os.tmpdir(), `sbox-gen-inline-${Date.now()}-${Math.random()}.json`);
  tmpPaths.push(tmpPath);
  fs.writeFileSync(tmpPath, json, "utf8");
  const l = new ApiLoader();
  await l.load(tmpPath);
  return l;
}

describe("generate — branch: method with no summary", () => {
  it("method without Documentation renders signature only (no ' — undefined')", async () => {
    const l = await loaderFromTypes([{
      Name: "T", FullName: "Edge.T", Namespace: "Edge", Group: "class",
      Assembly: "edge", IsPublic: true, DocId: "T:Edge.T",
      Methods: [{ Name: "Run", ReturnType: "void", IsPublic: true,
        IsVirtual: false, IsStatic: false, Parameters: [], DocId: "M:Edge.T.Run" }],
    }]);
    const out = makeTempOutput();
    await generate(l, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("- `void Run()`");
    expect(content).not.toContain("undefined");
  });
});

describe("generate — branch: constructor with no summary", () => {
  it("constructor without Documentation renders signature only (no ' — undefined')", async () => {
    const l = await loaderFromTypes([{
      Name: "T", FullName: "Edge.T", Namespace: "Edge", Group: "class",
      Assembly: "edge", IsPublic: true, DocId: "T:Edge.T",
      Constructors: [{ IsPublic: true, Parameters: [], DocId: "M:Edge.T.#ctor" }],
    }]);
    const out = makeTempOutput();
    await generate(l, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("- `()`");
    expect(content).not.toContain("undefined");
  });
});

describe("generate — branch: field with no Value", () => {
  it("field without Value renders name only without ' = undefined'", async () => {
    const l = await loaderFromTypes([{
      Name: "T", FullName: "Edge.T", Namespace: "Edge", Group: "class",
      Assembly: "edge", IsPublic: true, DocId: "T:Edge.T",
      Fields: [{ Name: "Constant", FieldType: "int", IsPublic: true, IsStatic: true }],
    }]);
    const out = makeTempOutput();
    await generate(l, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("- `Constant`");
    expect(content).not.toContain("undefined");
  });
});

describe("generate — branch: property with non-public accessors", () => {
  it("property where neither GetAccess nor SetAccess is Public renders without accessor block", async () => {
    const l = await loaderFromTypes([{
      Name: "T", FullName: "Edge.T", Namespace: "Edge", Group: "class",
      Assembly: "edge", IsPublic: true, DocId: "T:Edge.T",
      Properties: [{
        Name: "Internal", PropertyType: "string", IsPublic: true, IsStatic: false,
        GetAccess: "Protected", SetAccess: "Protected", DocId: "P:Edge.T.Internal",
      }],
    }]);
    const out = makeTempOutput();
    await generate(l, out);
    const content = fs.readFileSync(out, "utf8");
    expect(content).toContain("- `string Internal`");
    expect(content).not.toContain("undefined");
  });
});
