import { PLATFORM_GOTCHAS } from "../../src/data/gotchas";
import type { Gotcha } from "../../src/types";
import { searchGotchas } from "../../src/tools/search-gotchas";

// ── Fixtures ──────────────────────────────────────────────────────────────

const PROJECT_GOTCHA: Gotcha = {
  id: "project-network-auth",
  title: "Project: always validate auth before processing host RPC",
  tags: ["networking", "project-specific"],
  wrongPattern: "// missing auth check",
  wrongReason: "Auth not validated — host can be spoofed in this project",
  fix: "// check IsAuthenticated first",
  fixReason: "Validates connection ownership before processing",
  confirmedVersion: "2026-06-05-18-09-57",
  lastVerified: "2026-06-05-18-09-57",
  confirmedBy: "test",
  confidence: "single-source",
  source: "project",
};

function platform() {
  return { platformGotchas: PLATFORM_GOTCHAS, projectGotchas: [] };
}

function merged() {
  return { platformGotchas: PLATFORM_GOTCHAS, projectGotchas: [PROJECT_GOTCHA] };
}

// ── Empty / all queries ────────────────────────────────────────────────────

describe("searchGotchas — empty query", () => {
  it("empty string returns all platform entries", () => {
    expect(searchGotchas(platform(), "")).toHaveLength(15);
  });

  it("whitespace-only query returns all entries", () => {
    expect(searchGotchas(platform(), "   ")).toHaveLength(15);
  });

  it("empty query returns all merged entries (platform + project)", () => {
    expect(searchGotchas(merged(), "")).toHaveLength(16);
  });
});

// ── Tag filter ─────────────────────────────────────────────────────────────

describe("searchGotchas — tag filter", () => {
  it('"rpc" returns only rpc-tagged gotchas (2 entries)', () => {
    const results = searchGotchas(platform(), "rpc");
    expect(results).toHaveLength(2);
    expect(results.every((g) => g.tags.includes("rpc"))).toBe(true);
  });

  it('"physics" returns only physics-tagged gotchas (2 entries)', () => {
    const results = searchGotchas(platform(), "physics");
    expect(results).toHaveLength(2);
    expect(results.every((g) => g.tags.includes("physics"))).toBe(true);
  });

  it('"networking" returns 4 networking-tagged platform entries + 1 project entry', () => {
    const results = searchGotchas(merged(), "networking");
    expect(results).toHaveLength(5);
    expect(results.every((g) => g.tags.includes("networking"))).toBe(true);
  });

  it("tag query that matches no entries returns []", () => {
    // "input" is a known tag (mouse-visible entry) but the project gotcha has no input tag
    const results = searchGotchas(
      { platformGotchas: [], projectGotchas: [] },
      "rpc"
    );
    expect(results).toHaveLength(0);
  });
});

// ── Text search ────────────────────────────────────────────────────────────

describe("searchGotchas — text search", () => {
  it('"broadcast" returns the rpc-broadcast-fires-on-caller entry', () => {
    const results = searchGotchas(platform(), "broadcast");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("rpc-broadcast-fires-on-caller");
  });

  it('"Camera.Main" returns the camera-main-does-not-exist entry', () => {
    // "Camera" is a tag; "Main" is a text token — tag filter runs first
    const results = searchGotchas(platform(), "Camera.Main");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("camera-main-does-not-exist");
  });

  it("query with no match returns []", () => {
    expect(searchGotchas(platform(), "completelymadeupqueryzzzz")).toHaveLength(0);
  });
});

// ── Mixed tag + text ───────────────────────────────────────────────────────

describe("searchGotchas — mixed tag + text", () => {
  it('"networking broadcast" returns rpc-broadcast first (tag filters, text ranks)', () => {
    const results = searchGotchas(platform(), "networking broadcast");
    // tag "networking" reduces to 4 candidates; "broadcast" scores within those
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("rpc-broadcast-fires-on-caller");
    // all results must be networking-tagged (tag filter applied first)
    expect(results.every((g) => g.tags.includes("networking"))).toBe(true);
  });

  it("tag + text combo excludes entries that match tag but not text", () => {
    // "networking" + "broadcast": only broadcast entry scores > 0 among networking gotchas
    const results = searchGotchas(platform(), "networking broadcast");
    const ids = results.map((g) => g.id);
    expect(ids).not.toContain("isproxy-unreliable-with-ownertransfer-takeover");
    expect(ids).not.toContain("rpc-host-method-must-not-be-virtual");
  });
});

// ── Source preservation ────────────────────────────────────────────────────

describe("searchGotchas — source preservation", () => {
  it("platform entries in results have source === 'platform'", () => {
    const results = searchGotchas(merged(), "");
    const platformResults = results.filter((g) => g.id !== PROJECT_GOTCHA.id);
    expect(platformResults.every((g) => g.source === "platform")).toBe(true);
  });

  it("project entry in results has source === 'project'", () => {
    const results = searchGotchas(merged(), "");
    const projectResult = results.find((g) => g.id === PROJECT_GOTCHA.id);
    expect(projectResult?.source).toBe("project");
  });

  it("merged networking query preserves correct source on each entry", () => {
    const results = searchGotchas(merged(), "networking");
    for (const r of results) {
      if (r.id === PROJECT_GOTCHA.id) {
        expect(r.source).toBe("project");
      } else {
        expect(r.source).toBe("platform");
      }
    }
  });
});

// ── Merge / isolation ──────────────────────────────────────────────────────

describe("searchGotchas — merge and isolation", () => {
  it("platform-only deps returns no project entries", () => {
    const results = searchGotchas(platform(), "");
    expect(results.every((g) => g.source === "platform")).toBe(true);
  });

  it("project-only deps returns only the project entry", () => {
    const results = searchGotchas({ platformGotchas: [], projectGotchas: [PROJECT_GOTCHA] }, "");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("project");
  });

  it("both empty arrays returns []", () => {
    expect(searchGotchas({ platformGotchas: [], projectGotchas: [] }, "")).toHaveLength(0);
  });
});
