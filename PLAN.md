# Plan: sbox-claude-dev — Generic Claude Software Developer for s&box

## Context

The casino_game_sandbox project proved that Claude becomes dramatically more effective at s&box development when given the right context: platform-specific prompt files covering networking patterns, UI conventions, known gotchas, and a searchable API reference. The goal is to generalize that system into a reusable, open-source tool that any s&box developer can install.

The tool ships in two parts simultaneously:
1. **Prompt templates** — Markdown files developers copy into their s&box project
2. **MCP server** — TypeScript/Node.js server that makes the s&box API JSON searchable at query time + exposes a curated gotcha database

A separate **API maintenance framework** ensures the API reference stays current as s&box ships updates.

---

## Design Constraints

- **Offline-first.** All core functionality works without a network connection. Templates are files, the MCP server reads a local JSON, and the platform gotcha database is hardcoded TypeScript. When online, the tool performs an optional update pass (check CDN for newer API schema, check for updated gotcha entries) — this never blocks the developer or degrades the session.
- **Single source of truth for API facts.** The MCP server is the authoritative source for s&box type definitions. `SBOX_API_REFERENCE.md` is a *generated snapshot* derived from MCP server data, stamped with an API date, used as fallback only when the MCP server is unavailable. Never hand-edited. Prompt files explain *how to use and stitch together* s&box patterns — they do not restate API signatures.
- **One component at a time.** Build one file or tool, verify it works, get confirmation, commit, then proceed. Never batch-generate.

---

## Gotcha Taxonomy

Gotchas fall into two distinct categories that must never be mixed:

**Platform gotchas** — engine-level behaviors that apply to every s&box project, regardless of game design. Examples: `[Rpc.Broadcast]` fires on the caller, `IsProxy` is unreliable with `OwnerTransfer.Takeover`, `Camera.Main` does not exist. These live in `mcp-server/src/data/gotchas.ts`, are maintained by the community, and are shipped with the tool.

**Project gotchas** — patterns specific to one game's architecture. Examples: "Our EconomyManager always needs SyncFlags.FromHost", "Our pickup flow requires host approval before TakeOwnership". These live in the developer's own project at `.claude/gotchas.json` and are never part of this repo.

The MCP server loads both. `search_gotchas` merges results and tags each with `source: "platform" | "project"`. Claude is instructed to treat project gotchas as authoritative for that codebase, and to note the source when citing either type.

**What makes a gotcha platform-level vs. project-level:**
- Platform: describes a behavior of the s&box *engine* (a class, method, or attribute that ships with s&box)
- Project: describes a behavior of *your game's custom code*

When in doubt, ask: "Would a developer building a completely different game (a racing game, a survival game) also hit this?" If yes, it's platform-level.

**Note on casino-project patterns:**
Several patterns from the casino project are casino-specific architectures, not engine behaviors. Their *gotchas* may be platform-level (e.g., "OwnerTransfer.Takeover breaks IsProxy" — that's an engine behavior), but the *pattern descriptions* in templates are generalized to describe the underlying engine mechanisms. Templates never reference casino-specific class names.

---

## Feature Development Workflow

Documented in `COMMANDS.md.template` and enforced by Claude's session behavior. Applies to every feature request in every project that installs this tool.

### Protocol

```
User describes a feature
        ↓
Claude questions the feature
  - What exactly needs to happen?
  - What s&box constraints apply? (networking? ownership? UI assembly boundary?)
  - What existing systems does this touch?
  - What edge cases or failure modes exist?
  - Are there relevant gotchas? (Claude runs search_gotchas before planning)
        ↓
Claude proposes a plan
  - Which files get created or modified
  - Which s&box patterns apply (IsProxy guard, [Sync], RPC flow, BuildHash, etc.)
  - Which gotchas are flagged as relevant
  - What the verification looks like
        ↓
Claude questions its own plan
  - Does any step reference a type that should be verified via search_sbox_api?
  - Are there networking or ownership implications not accounted for?
  - Is scope creeping beyond what was asked?
        ↓
User reviews. Loop (refine → re-question) until user says:
  "lets move forward and build"
        ↓
Claude asks: verbose or normal mode?
        ↓
Build begins — one file at a time, gate before proceeding
```

### Verbose vs. Normal Mode

Asked once per feature, immediately before building starts. Stored for the session; toggled with `set_mode verbose` or `set_mode normal`.

**Normal mode (default):** MCP responses return method/property signatures with one-line doc summaries. Sufficient for most work; keeps context cost proportional to the task.

**Verbose mode:** MCP responses return full type objects — all documentation, remarks, parameter descriptions, return type details. Developer chooses this when working with unfamiliar or complex APIs where Claude needs deeper understanding before generating code.

The `verbose` flag is passed by Claude to `get_sbox_type` and `search_sbox_api` based on the current session mode.

---

## Repository Structure

```
sandbox-claude-assistant/
├── CLAUDE.md                       ← Claude instructions for THIS repo's development
├── PLAN.md                         ← This file
├── README.md                       ← GitHub landing page, install steps, quick start
├── LICENSE                         ← MIT
├── CONTRIBUTING.md                 ← PR guidelines per contribution type
├── CHANGELOG.md                    ← semver history
│
├── templates/                      ← Files developers copy into their s&box project
│   ├── CLAUDE.md.template
│   ├── SYSTEM_PROMPT.md.template
│   ├── NETWORKING_PROMPT.md.template
│   ├── UI_PROMPT.md.template
│   ├── DESIGN_PROMPT.md.template   ← Blank skeleton; game-specific
│   ├── MAP_PROMPT.md.template      ← Blank skeleton; Hammer/level design
│   ├── SESSION_START.md.template
│   ├── COMMANDS.md.template        ← Includes feature development workflow protocol
│   └── SBOX_API_REFERENCE.md       ← Generated snapshot from MCP data; never hand-edited
│
├── mcp-server/
│   ├── package.json                ← name: "@sbox-claude/mcp-server"; minimal deps
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                ← Server init, tool registration, startup diagnostics
│   │   ├── api-loader.ts           ← Streams + indexes API JSON; inverted index; LRU cache
│   │   ├── api-updater.ts          ← Online check against CDN; local cache management
│   │   ├── project-gotchas.ts      ← Loads optional .claude/gotchas.json from project root
│   │   ├── sanitizer.ts            ← Strips prompt-injection patterns from doc strings
│   │   ├── types.ts                ← TypeScript interfaces matching API JSON shape
│   │   ├── tools/
│   │   │   ├── search-api.ts       ← search_sbox_api(query, namespace?, verbose?)
│   │   │   ├── get-type.ts         ← get_sbox_type(typeName, verbose?)
│   │   │   ├── list-namespaces.ts  ← list_namespaces()
│   │   │   ├── search-gotchas.ts   ← search_gotchas(query) — merges platform + project
│   │   │   └── get-api-info.ts     ← get_api_info()
│   │   └── data/
│   │       └── gotchas.ts          ← Platform gotcha database; no API JSON dependency
│   ├── test/
│   │   ├── fixtures/
│   │   │   └── api.fixture.json    ← Synthetic test fixture (see Test Fixture Specification)
│   │   ├── api-loader.test.ts
│   │   ├── sanitizer.test.ts
│   │   ├── search-api.test.ts
│   │   ├── get-type.test.ts
│   │   ├── list-namespaces.test.ts
│   │   ├── search-gotchas.test.ts
│   │   └── get-api-info.test.ts
│   └── dist/                       ← gitignored compiled output
│
├── scripts/
│   ├── generate-api-reference.ts   ← Reads local API JSON, outputs SBOX_API_REFERENCE.md
│   ├── install.sh / install.ps1
│   ├── uninstall.sh / uninstall.ps1
│   └── export-api.sh               ← Helper for exporting API JSON from s&box devtools
│
├── api/
│   └── README.md                   ← How to obtain the API JSON; CDN URL documented here
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── api-check.yml           ← Periodic CDN check for new releases
│   └── ISSUE_TEMPLATE/
│       ├── new-gotcha.md
│       ├── pattern-bug.md
│       └── prompt-improvement.md
│
└── docs/
    ├── patterns/
    │   ├── networking.md
    │   ├── ui-panels.md
    │   ├── pickup-carry-framework.md   ← Generic; describes rigidbody + ownership pattern
    │   └── registry-pattern.md
    └── validation-checklist.md
```

---

## Phase 1: Template Files

### Separation of Concerns
- **MCP server** = source of truth for API *facts* (type names, signatures, namespaces)
- **`SBOX_API_REFERENCE.md`** = generated snapshot from MCP data; versioned with API date; fallback only; never hand-edited
- **Prompt files** = explain *how to use* s&box patterns — reference type names but never restate signatures

### Content Rules
- **Stays generic (100% portable):** All s&box engine quirks, API conventions, lifecycle rules, [Sync] variants, RPC rules, IsProxy behavior, BuildHash pattern, bridge pattern, registry pattern, generic pickup/carry pattern (described by engine mechanism, not casino class names)
- **Developer fills in:** Project name, game description, specific systems, key file map, data schemas, build state, design intent, project-specific gotchas

### Source Mapping (casino → template)
| Template | Primary source | What gets stripped / generalized |
|---|---|---|
| `CLAUDE.md.template` | `casino/CLAUDE.md` | Casino build state, key file map → blank sections + `{{PROJECT_NAME}}` |
| `SYSTEM_PROMPT.md.template` | `casino/SYSTEM_PROMPT.md` | Economy/currency/role/tier → `## Project-Specific Systems` skeleton |
| `NETWORKING_PROMPT.md.template` | `casino/NETWORKING_PROMPT.md` | Casino-specific class references → generic "pickup/carry framework" pattern using engine mechanism names only |
| `UI_PROMPT.md.template` | `casino/UI_PROMPT.md` | Per-panel specs → `## Panel Inventory` skeleton |
| `DESIGN_PROMPT.md.template` | `casino/DESIGN_PROMPT.md` | All casino content → annotated structure skeleton |
| `COMMANDS.md.template` | `casino/COMMANDS.md` + feature workflow | Adds `build_feature` protocol; `set_mode verbose/normal`; `{{PROJECT_NAME}}` |
| `SESSION_START.md.template` | `casino/SESSION_START.md` | `{{PROJECT_ROOT}}` substitution |

### Placeholder Tokens
`{{PROJECT_NAME}}`, `{{PROJECT_ROOT}}`, `{{GAME_DESCRIPTION}}`, `{{MAX_PLAYERS}}`, `{{TICK_RATE}}`

---

## Phase 2: MCP Server

### API Schema Source
The s&box API schema is published by Facepunch at:
```
https://cdn.sbox.game/releases/{timestamp}.zip.json
```
The timestamp portion updates with each engine release (e.g., `2026-06-05-18-09-57`). There is no stable "latest" alias — the specific release URL must be discovered by checking for newer timestamps.

The MCP server manages this through `api-updater.ts`:
- **Local cache** (primary): `~/.sbox-claude/api-cache/{timestamp}.zip.json`. All indexing reads from local cache. Never hits the network for a cached version.
- **Update check** (optional, online only): On startup, if online, compares the newest cached timestamp against the latest timestamp discoverable at the CDN. If a newer release exists, logs a notice and optionally downloads it to cache. Never blocks startup or degrades session.
- **Manual update**: `npx @sbox-claude/mcp-server --update` explicitly downloads the latest release to cache.
- **`SBOX_API_JSON` env var**: If set, overrides the cache lookup and uses that specific file directly. Useful for pinning to a specific API version or using a locally exported file.

### Security

**Input sanitization (`sanitizer.ts`):**
All documentation strings from the API JSON pass through a sanitizer before being returned to Claude. Strips patterns that could constitute prompt injection (instruction-like phrasing, system-prompt-style markers). Applied to all `Documentation.Summary`, `Documentation.Remarks`, and member doc comments.

**API JSON integrity validation:**
On load, validates: root structure is `{ Types: array }`, minimum type count threshold met, all entries have at minimum `Name`, `FullName`, `Namespace`, `Group`. Fails with a clear error rather than proceeding with corrupt data.

**Input validation on tool calls:**
All tool parameters validated before processing: string length bounds, no null bytes, no path traversal characters.

**npm supply chain:**
Minimal dependencies — only `@modelcontextprotocol/sdk`. `package-lock.json` committed. Releases use npm provenance signing.

### Performance

**Inverted index:**
At load time, builds an inverted index: tokens (split on `.`, camelCase boundaries, whitespace) → Set of FullNames. `search_sbox_api("WorldPanel")` resolves via exact token lookup before falling back to scored keyword matching. Eliminates linear scans.

**Search result ranking:**
Exact FullName match → exact Name match → prefix match on Name → keyword hit in summary. Highest-relevance type returned first.

**LRU cache:**
Recently fetched full type objects kept in a bounded LRU cache. Eliminates redundant disk reads for frequently accessed types within a session.

**Async index build:**
Index built asynchronously after server start. Tool calls arriving before index is ready receive `{ indexReady: false }` rather than blocking. `get_api_info` reports readiness status.

**Verbose vs. Normal response mode:**
- **Normal:** Signatures and one-line summaries only. Doc comments truncated.
- **Verbose:** Full type object, all doc comments, all remarks.

`verbose` is a parameter on `get_sbox_type` and `search_sbox_api`, passed by Claude based on session mode.

### API JSON TypeScript Interface (confirmed from current schema)
```typescript
// Root: { "Types": SboxType[] }
interface SboxType {
  Name: string;
  FullName: string;
  Namespace: string;
  Group: "class" | "interface" | "enum" | "struct";
  Assembly: string;
  IsPublic: boolean;
  IsAbstract?: boolean;
  BaseType?: string;
  Documentation?: { Summary?: string; Remarks?: string };
  Methods?: SboxMethod[];
  Properties?: SboxProperty[];
  Fields?: SboxField[];
  Constructors?: SboxConstructor[];
  DocId: string;
}
```

### Startup Sequence
1. Resolve API JSON: check `SBOX_API_JSON` env var → fall back to newest local cache entry
2. Validate file integrity
3. Begin async index build (Maps + inverted index)
4. Accept connections immediately; return `indexReady: false` for data tools during build
5. On index complete: log ready state with type count and API date
6. If API JSON absent or invalid: degraded mode — data tools unavailable; `search_gotchas`, `get_api_info`, `list_namespaces` still work
7. If online (non-blocking background): check CDN for newer release; log notice if found

### Debug Mode
Activated with `--debug` flag or `SBOX_MCP_DEBUG=true` env var.

- Every tool call logged to `~/.sbox-claude/debug.log` (override with `SBOX_MCP_LOG_PATH`): timestamp, tool name, input params, response summary, duration
- Full response payloads logged (not truncated)
- Index build steps logged with timing
- Startup banner prints the log file path

Enables diagnosis of: wrong search results, unexpected gotcha hits, stale API data, wrong type fetched.

### MCP Tools

**`search_sbox_api(query, namespace?, verbose?)`**
Inverted index lookup → ranked fallback. Returns stubs (normal) or full definitions (verbose). Results ranked by match quality.

**`get_sbox_type(typeName, verbose?)`**
Resolves by FullName first, then Name. Disambiguation note if multiple types share a Name. Sanitized before output. Normal: signatures only. Verbose: full object.

**`list_namespaces()`**
All namespaces with type counts and representative types. Always full data (small response).

**`search_gotchas(query)`**
Merges platform gotchas (`data/gotchas.ts`) and project gotchas (`.claude/gotchas.json` if present). Tag-first filtering, then ranked keyword search on title + description. Returns: `{id, title, wrongPattern, fix, confirmedVersion, lastVerified, confidence, tags, source}`. Always available regardless of API JSON state.

**`get_api_info()`**
Returns: `{loaded, indexReady, typeCount, apiDate, cacheDir, updateAvailable, namespaces[], degraded, debugMode}`.

### Gotcha Validation Framework

A bad gotcha is worse than no gotcha. If the database contains wrong information, Claude produces wrong code *with confidence*. Every entry must pass all gates before commit.

**Required fields:**
```typescript
interface Gotcha {
  id: string;               // kebab-case
  title: string;
  tags: string[];           // ["networking", "rpc", "ownership", "ui", "physics", ...]
  wrongPattern: string;     // C# snippet showing the wrong approach
  wrongReason: string;      // mechanism explanation — not just "it fails"
  fix: string;              // C# snippet showing the correct approach
  fixReason: string;        // mechanism explanation — not just "use this instead"
  apiTypes?: string[];      // engine type names referenced — CI cross-checks existence
  confirmedVersion: string; // API timestamp when confirmed
  lastVerified: string;     // API timestamp of most recent re-verification
  confirmedBy: string;      // "casino-project" or GitHub handle
  confidence: "single-source" | "multi-source" | "verified";
  source: "platform";       // always "platform" for entries in data/gotchas.ts
}
```

Project gotchas loaded from `.claude/gotchas.json` use the same schema but with `source: "project"`.

**Validation gates:**

1. **Structural gate (CI):** All required fields non-empty. `wrongPattern` and `fix` pass a basic C# syntax check. `apiTypes` entries exist in current API JSON. `lastVerified` ≥ `confirmedVersion`.

2. **Accuracy gate (manual):** Wrong pattern must actually be wrong — not a style preference. Requires evidence from a real project (link to commit, PR, or session) or an independent second reviewer who hit the same issue.

3. **Scope gate (manual):** Must describe engine behavior, not project-specific code. Ask: "Would a developer building a completely different game hit this?" If no, it belongs in project gotchas, not here.

4. **Currency gate (periodic):** On new API JSON ingest, CI checks all `apiTypes` entries. Missing types flag the gotcha for review. Flagged entries are demoted to `confidence: "single-source"` until re-verified.

**Initial seed confidence:**
All casino-project entries: `confidence: "single-source"`, `confirmedBy: "casino-project"`. Claude notes confidence level when citing: *"Note: single-source confirmed — verify if on a newer engine version."*

### Platform Gotcha Seed (`data/gotchas.ts`)
All entries describe engine-level behaviors. None reference casino-specific class names.
```
[Rpc.Broadcast] fires on caller — use Rpc.FilterInclude to exclude
IsProxy unreliable with OwnerTransfer.Takeover
Never mark [Rpc.Host] methods as virtual
FindMode.EverythingInSelf does not search ancestors
HighlightOutline component must be on root GameObject, not a child
WorldPanel.PanelSize (virtual canvas) ≠ RenderScale (physical size)
RealTime.Now is wall-clock uptime; Time.Now is game time
Scene.GetAllComponents<T>() not FindObjectOfType (Unity-ism)
Camera.Main does not exist in s&box (Unity-ism)
Mouse.Visible is obsolete
OwnerTransfer.Takeover on host-managed objects breaks IsProxy guards
IUse interface was removed; use IPressable
Disabling a Rigidbody component does not disable its colliders
Re-enabling a collider overlapping the player capsule can launch physics bodies
Scene editor serialization can overwrite component state set in code
```

---

## Phase 3: API Maintenance Framework

### Schema CDN
```
https://cdn.sbox.game/releases/{timestamp}.zip.json
```
`{timestamp}` = release date-time string (e.g., `2026-06-05-18-09-57`). Updates with each engine release. No stable "latest" alias — newer releases have a larger timestamp value and can be detected by comparison.

`api-updater.ts` responsibilities:
- Parse and compare timestamps to determine newest available vs. newest cached
- Download to local cache on `--update` or when user confirms an available update
- Never auto-download without user awareness; log a notice, never silently replace

### SBOX_API_REFERENCE.md Generation
`scripts/generate-api-reference.ts` reads the local API JSON through the same loader, extracts commonly used types, and writes `templates/SBOX_API_REFERENCE.md` with an API date header. Committed to the repo. Regenerated (not hand-edited) whenever the local API JSON is updated.

### Staleness Detection
- `get_api_info` exposes `apiDate` and `updateAvailable` to Claude
- `CLAUDE.md.template` instructs Claude: when `get_api_info` shows an outdated API, warn the user before using types that may have changed

### GitHub Action: `api-check.yml`
Runs periodically. Fetches the CDN releases directory to detect new timestamps. If a newer release exists than what's in the repo's `api/` README, opens an issue with a checklist: download new schema, regenerate `SBOX_API_REFERENCE.md`, verify gotcha `apiTypes`, bump version.

### Community Update Workflow
1. File issue using "new-gotcha" or "pattern-bug" template
2. PR updates `gotchas.ts` only (TypeScript, clean diffs)
3. CI runs structural gate checks
4. Manual reviewer checks accuracy + scope gates

### Versioning
Semver. Gotcha additions = patch. Prompt content changes = minor. MCP tool schema changes = major. Templates carry `<!-- sbox-claude-dev v0.0.0 -->` header for diffing.

---

## Phase 4: Installation and Uninstall

### Install (`scripts/install.sh` / `install.ps1`)
1. Prompt for s&box project root — validate, reject path traversal
2. Prompt for placeholder values
3. Copy `templates/*.template` files with placeholder substitution; skip files already present (idempotent)
4. Prompt for API JSON path or offer to download latest from CDN
5. Write `.mcp.json` using `npx @sbox-claude/mcp-server` invocation (no absolute paths)
6. Write `.claude/settings.json` with permission allowlists
7. Write `.claude/sbox-claude-dev.manifest` (list of installed files — used by uninstall)
8. Print "Next steps" summary

Running install twice: skips already-present templates, merges `.mcp.json` without duplicating, idempotent.

### Uninstall (`scripts/uninstall.sh` / `uninstall.ps1`)
1. Confirm with user
2. Read `.claude/sbox-claude-dev.manifest`
3. For each installed file: remove only the platform-maintained section (above `<!-- PROJECT CUSTOMIZATIONS -->` marker); leave developer additions intact
4. Remove `sbox` entry from `.mcp.json`
5. Remove `sbox-claude-dev` section from `.claude/settings.json`
6. Delete manifest
7. Print summary of removed vs. preserved content

---

## Test Fixture Specification

The test fixture is `mcp-server/test/fixtures/api.fixture.json` — the only API data source used in tests. No test touches the real API JSON or CDN.

### Purpose
- Tests are deterministic and reproducible on any machine without a local s&box install
- The fixture is designed to exercise every code path deliberately; the real file does not
- Fixture → tests → implementation is the build order (not implementation → tests)
- The fixture is validated against `SboxType` interfaces; schema changes break CI immediately

### Required Coverage Cases
| Case | Why needed |
|---|---|
| `class` in `Sandbox` with Methods, Properties, Constructors, and rich documentation | Full `get_sbox_type` output — common case |
| `class` with no documentation at all | Graceful handling of missing docs |
| `interface` in `Sandbox` | Group = "interface" display |
| `enum` | Enum member rendering |
| `struct` | Struct display |
| Type in `Sandbox.UI` namespace | Multi-segment namespace handling |
| Abstract class | `IsAbstract` display |
| Type with `BaseType` set | Inheritance chain display |
| Type with overloaded methods (same name, different signatures) | All overloads returned |
| Two types with same `Name`, different `Namespace` | FullName disambiguation in `get_sbox_type` |
| Type whose name appears in a gotcha's `apiTypes` (e.g., `Component`) | Gotcha `apiTypes` cross-check test |
| Type `Camera` with no `.Main` static property | `search_sbox_api("Camera.Main")` returns zero results |
| Type with a documentation string containing a prompt-injection attempt | Sanitizer strips it before output |
| Type in `Sandbox.Physics` namespace | Multi-namespace coverage in `list_namespaces` |

### Fixture Type Names
Use real s&box type names for readable test assertions:

| Type | Namespace | Group | Notes |
|---|---|---|---|
| `Component` | `Sandbox` | class, abstract | Has lifecycle methods; appears in gotcha `apiTypes` |
| `GameObject` | `Sandbox` | class | Has networking methods; has `BaseType` |
| `WorldPanel` | `Sandbox.UI` | class | Tests multi-segment namespace |
| `IPressable` | `Sandbox` | interface | Tests interface group |
| `PhysicsBody` | `Sandbox.Physics` | struct | No documentation |
| `NetworkMode` | `Sandbox` | enum | Tests enum rendering |
| `Camera` | `Sandbox` | class | Exists as type; no `.Main` property — disambiguation test |
| `CameraComponent` | `Sandbox` | class | Same short-name pattern as Camera — tests disambiguation |
| `MaliciousDoc` | `Sandbox.Test` | class | Doc contains prompt-injection string — sanitizer test |

Each fixture type has only the members required to exercise its test case — not a faithful copy of the real type.

---

## Community Infrastructure

### `.github/ISSUE_TEMPLATE/`
- **new-gotcha.md**: symptom, what Claude generated vs. correct engine behavior, C# code example, engine version, whether this is platform-level
- **pattern-bug.md**: which template file, what Claude did wrong, correct pattern, before/after
- **prompt-improvement.md**: general improvement with before/after behavior

### `CONTRIBUTING.md`
Three contribution paths:
- **Platform gotcha additions** (lightest): structural gate via CI, manual accuracy + scope review, `apiTypes` CI check
- **Prompt content changes** (medium): must be platform-level, include before/after behavior demonstration
- **MCP tool schema changes** (heaviest): backwards compatibility required, existing tool schemas must not change in breaking ways

### `PULL_REQUEST_TEMPLATE.md`
Checkboxes: "Describes engine behavior (not game-specific code)?", "CI passes?", "`lastVerified` updated?", "Tool schema unchanged or major bump justified?", "C# snippets compile?"

---

## Build Methodology

**Rule: one component at a time.** Write one file or tool, verify it works, get confirmation, commit, then proceed.

**Step gate format:**
1. Write the single file or tool
2. Test it (`npm test`, load in Claude, run script, inspect output)
3. Confirm behavior matches intent in this plan
4. Commit
5. Proceed to next step only

---

## Build Order

Each item is one step. Do not proceed until the current step passes its gate.

1. **Write `api.fixture.json`** — per Test Fixture Specification. Gate: valid JSON; all coverage cases present; parses cleanly.

2. **Read all casino source files** — `SYSTEM_PROMPT.md`, `NETWORKING_PROMPT.md`, `UI_PROMPT.md`, `COMMANDS.md`, `SESSION_START.md`, `CLAUDE.md`, `DESIGN_PROMPT.md`, `SBOX_API_REFERENCE.md`. Gate: can accurately describe each file's contents without re-reading.

3. **Scaffold MCP server** — `package.json`, `tsconfig.json`, `src/types.ts`. Gate: `npm install` succeeds, `tsc --noEmit` passes.

4. **Write `sanitizer.ts` + tests**. Gate: injection string is sanitized; clean doc string passes through unchanged.

5. **Write `api-loader.ts` + tests** — streaming index, inverted index, LRU cache. Gate: fixture loads correctly; inverted index resolves `"WorldPanel"` to `Sandbox.UI.WorldPanel`; LRU cache verified.

6. **Write `api-updater.ts` + tests** — CDN timestamp comparison, local cache management. Gate: mocked newer CDN timestamp returns `updateAvailable: true`; offline mode bypasses all CDN calls.

7. **Write `project-gotchas.ts` + tests** — loads `.claude/gotchas.json` from project root. Gate: entries loaded with `source: "project"`; absent file returns empty array without error.

8. **Implement `get_api_info` tool + tests**. Gate: correct metadata from fixture; `degraded: true` when no API JSON; `indexReady` reflects build state.

9. **Write `data/gotchas.ts`** with all platform seed entries. Gate: all entries satisfy `Gotcha` interface; structural CI check passes; `apiTypes` entries exist in fixture.

10. **Implement `search_gotchas` tool + tests**. Gate: broadcast and proxy entries found; tag-first filtering verified; platform + project sources merged correctly.

11. **Implement `search_sbox_api` tool + tests**. Gate: `"WorldPanel"` returns `Sandbox.UI.WorldPanel` first; `"Camera.Main"` returns zero results; ranking verified.

12. **Implement `get_sbox_type` tool + tests** (normal + verbose). Gate: normal mode truncates docs; verbose returns full object; disambiguation works; sanitizer applied.

13. **Implement `list_namespaces` tool + tests**. Gate: all fixture namespaces returned with correct type counts.

14. **Wire `index.ts`** — server init, tool registration, startup sequence, debug mode. Gate: server starts; `--debug` creates log file; degraded mode behaves correctly.

15. **Write `generate-api-reference.ts`** script. Gate: valid Markdown output with API date header; deterministic.

16. **Write `CLAUDE.md.template`**. Gate: fresh session orients correctly; avoids Unity APIs; asks verbose/normal before building.

17. **Write `SYSTEM_PROMPT.md.template`**. Gate: Claude writes IsProxy guard, [Sync] property, Rpc.Host→Rpc.Broadcast flow correctly unprompted.

18. **Write `NETWORKING_PROMPT.md.template`**. Gate: Claude describes generic pickup/carry ownership transfer pattern without casino class names.

19. **Write `UI_PROMPT.md.template`**. Gate: Claude uses `BuildHash()` not `StateHasChanged()`; reads [Sync] directly in Razor; no code-mounted panels.

20. **Write remaining templates** one at a time — `DESIGN`, `MAP`, `SESSION_START`, `COMMANDS`. Gate per template: load and verify Claude answers what it's supposed to answer.

21. **Write `install.sh` / `install.ps1`**. Gate: idempotent; `npx` invocation; manifest written.

22. **Write `uninstall.sh` / `uninstall.ps1`**. Gate: manifest-listed files removed; customizations preserved; `.mcp.json` cleaned.

23. **Write community files** — `README.md`, `CONTRIBUTING.md`, `LICENSE`, `CHANGELOG.md`. Gate: unfamiliar developer can follow README to a working install.

24. **Write GitHub scaffolding** — issue templates, PR template, `ci.yml`, `api-check.yml`. Gate: CI passes on test PR.

25. **Write `CLAUDE.md`** for this repo. Gate: fresh session knows build commands, architecture, one-step rule.

---

## Verification

After build, install into the casino project and run a full session:
- `get_api_info` reports correct type count, API date, `indexReady: true`
- `search_sbox_api("WorldPanel")` returns `Sandbox.UI.WorldPanel` first
- `get_sbox_type("Component")` normal: signatures only; verbose: full docs
- `search_gotchas("broadcast")` returns platform entry with `confidence: "single-source"` noted
- Project `.claude/gotchas.json` entries appear with `source: "project"`
- `npm test` passes on a machine with no local s&box API JSON
- Install idempotent; uninstall preserves customizations
- `--debug` creates a readable log of all tool calls
