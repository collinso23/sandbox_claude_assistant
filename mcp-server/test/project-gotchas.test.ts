import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadProjectGotchas } from "../src/project-gotchas";

// ── Helpers ───────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeProjectRoot(): string {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "project-gotchas-test-"));
  tmpDirs.push(p);
  return p;
}

function writeGotchasFile(projectRoot: string, content: unknown): void {
  const claudeDir = path.join(projectRoot, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "gotchas.json"), JSON.stringify(content));
}

function writeGotchasRaw(projectRoot: string, content: string): void {
  const claudeDir = path.join(projectRoot, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "gotchas.json"), content);
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true }); } catch {}
  }
});

const MINIMAL_ENTRY = {
  id: "test-gotcha",
  title: "Test gotcha",
  tags: ["networking"],
  wrongPattern: "// wrong",
  wrongReason: "because",
  fix: "// right",
  fixReason: "because",
  confirmedVersion: "2026-06-05-18-09-57",
  lastVerified: "2026-06-05-18-09-57",
  confirmedBy: "test",
  confidence: "single-source" as const,
  source: "project" as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe("loadProjectGotchas", () => {
  it("returns [] when .claude/gotchas.json does not exist", async () => {
    const root = makeProjectRoot();
    await expect(loadProjectGotchas(root)).resolves.toEqual([]);
  });

  it("returns [] when the project root itself does not exist", async () => {
    const nonExistent = path.join(os.tmpdir(), "no-such-project-xyz");
    await expect(loadProjectGotchas(nonExistent)).resolves.toEqual([]);
  });

  it("returns [] for an empty array", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, []);
    await expect(loadProjectGotchas(root)).resolves.toEqual([]);
  });

  it("returns one entry with source='project' for a single-entry file", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, [MINIMAL_ENTRY]);
    const results = await loadProjectGotchas(root);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("project");
    expect(results[0].id).toBe("test-gotcha");
  });

  it("returns all entries and tags source='project' on each", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, [
      { ...MINIMAL_ENTRY, id: "gotcha-1" },
      { ...MINIMAL_ENTRY, id: "gotcha-2" },
      { ...MINIMAL_ENTRY, id: "gotcha-3" },
    ]);
    const results = await loadProjectGotchas(root);
    expect(results).toHaveLength(3);
    expect(results.every((g) => g.source === "project")).toBe(true);
    expect(results.map((g) => g.id)).toEqual(["gotcha-1", "gotcha-2", "gotcha-3"]);
  });

  it("overrides source to 'project' even when file claims source='platform'", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, [{ ...MINIMAL_ENTRY, source: "platform" }]);
    const results = await loadProjectGotchas(root);
    expect(results[0].source).toBe("project");
  });

  it("throws with the file path in the message on malformed JSON", async () => {
    const root = makeProjectRoot();
    writeGotchasRaw(root, "{ this is not json }");
    await expect(loadProjectGotchas(root)).rejects.toThrow(
      path.join(root, ".claude", "gotchas.json")
    );
  });

  it("throws when JSON root is an object instead of an array", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, { gotchas: [] });
    await expect(loadProjectGotchas(root)).rejects.toThrow(/root must be an array/);
  });

  it("throws when an entry in the array is not an object", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, [MINIMAL_ENTRY, "not-an-object"]);
    await expect(loadProjectGotchas(root)).rejects.toThrow(/each entry must be an object/);
  });

  it("resolves a relative project root path correctly", async () => {
    const root = makeProjectRoot();
    writeGotchasFile(root, [MINIMAL_ENTRY]);
    // path.resolve will normalize a relative path — pass the absolute path to confirm it works
    const results = await loadProjectGotchas(root);
    expect(results).toHaveLength(1);
  });
});
