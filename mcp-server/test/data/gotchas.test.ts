import * as fs from "fs";
import * as path from "path";
import { PLATFORM_GOTCHAS } from "../../src/data/gotchas";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "api.fixture.json");

// Load fixture type Names once for apiTypes cross-check
const fixtureTypeNames = new Set<string>(
  (JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as { Types: Array<{ Name: string }> })
    .Types.map((t) => t.Name)
);

// ── Count ─────────────────────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — count", () => {
  it("contains exactly 15 entries", () => {
    expect(PLATFORM_GOTCHAS).toHaveLength(15);
  });
});

// ── Required fields ───────────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — required fields", () => {
  it("every entry has a non-empty id", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(typeof g.id).toBe("string");
      expect(g.id.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty title", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(typeof g.title).toBe("string");
      expect(g.title.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty tags array", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(Array.isArray(g.tags)).toBe(true);
      expect(g.tags.length).toBeGreaterThan(0);
    }
  });

  it("every entry has non-empty wrongPattern, wrongReason, fix, fixReason", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(g.wrongPattern.length).toBeGreaterThan(0);
      expect(g.wrongReason.length).toBeGreaterThan(0);
      expect(g.fix.length).toBeGreaterThan(0);
      expect(g.fixReason.length).toBeGreaterThan(0);
    }
  });

  it("every entry has non-empty confirmedVersion, lastVerified, confirmedBy", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(g.confirmedVersion.length).toBeGreaterThan(0);
      expect(g.lastVerified.length).toBeGreaterThan(0);
      expect(g.confirmedBy.length).toBeGreaterThan(0);
    }
  });
});

// ── Source and confidence ─────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — source and confidence", () => {
  it("every entry has source === 'platform'", () => {
    for (const g of PLATFORM_GOTCHAS) {
      expect(g.source).toBe("platform");
    }
  });

  it("every entry has a valid confidence value", () => {
    const valid = new Set(["single-source", "multi-source", "verified"]);
    for (const g of PLATFORM_GOTCHAS) {
      expect(valid.has(g.confidence)).toBe(true);
    }
  });
});

// ── Uniqueness ────────────────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — uniqueness", () => {
  it("all ids are unique", () => {
    const ids = PLATFORM_GOTCHAS.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ── apiTypes cross-check ──────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — apiTypes fixture cross-check", () => {
  it("apiTypes, when present, is non-empty (omit the field rather than leaving it [])", () => {
    for (const g of PLATFORM_GOTCHAS) {
      if (g.apiTypes !== undefined) {
        expect(g.apiTypes.length).toBeGreaterThan(0);
      }
    }
  });

  it("every apiTypes name exists in api.fixture.json", () => {
    for (const g of PLATFORM_GOTCHAS) {
      if (!g.apiTypes) continue;
      for (const typeName of g.apiTypes) {
        expect(fixtureTypeNames.has(typeName)).toBe(true);
      }
    }
  });
});

// ── Platform purity ───────────────────────────────────────────────────────

describe("PLATFORM_GOTCHAS — platform purity", () => {
  const CASINO_CLASS_NAMES = ["EconomyManager", "ChipStack", "CasinoGame", "PlayerWallet"];

  it("no entry references casino-specific class names in wrongPattern or fix", () => {
    for (const g of PLATFORM_GOTCHAS) {
      for (const name of CASINO_CLASS_NAMES) {
        expect(g.wrongPattern).not.toContain(name);
        expect(g.fix).not.toContain(name);
      }
    }
  });
});
