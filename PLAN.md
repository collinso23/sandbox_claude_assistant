# Plan: sbox-claude-dev — Build State

See `DESIGN.md` for architecture, constraints, and design rationale.

---

## Status

**Completed through:** Step 15.5-B
**Current step:** 16 — Write `CLAUDE.md.template`
**Remaining:** Steps 17–25

Last updated: 2026-06-12

---

## Build Methodology

**Rule: one component at a time.** Write one file or tool, verify it works, get confirmation, commit, then proceed.

**Step gate — two parts:**

**Part 1 — Feature gate** (defined per step in Build Order):
The observable behaviors that must work for that specific file.

**Part 2 — Methodology gate** (applied to every step before marking complete):
Ask — not tick — each of the following against the file just written:

| Category | Key question |
|---|---|
| Test Coverage | Every public method has: happy path, guard clauses hit, both branch sides, optional params varied, boundary values, error/rejection paths, and specific (not just existence) assertions |
| Security | Network/external data validated at the boundary; no path traversal; errors never embed untrusted content; no eval/dynamic execution |
| Algorithmic Complexity | Frequent lookups are O(1) Maps; expensive work is load-time not query-time; no hidden O(n²) patterns |
| Async Correctness | Every async path resolves or rejects; no hanging promises; shared state never exposed in a partial/in-progress form |
| Robustness | Optional dependencies degrade gracefully; errors name what failed, what was expected, and what was received; safe return types (array not undefined) |
| Interface Minimalism | Only needed exports; private helpers unexported; return types as narrow as possible; no method that does two distinct things |
| Boundary / Edge Cases | Empty string/array/zero, single-element collections, missing optional fields, unicode, values at structure limits |
| Observability | Errors identify source and bad value; state is inspectable for tests; debug mode logs useful metadata |
| Resource Lifecycle | Memory is bounded; file/network handles closed; test temp files cleaned up; background timers injectable not auto-started |

The methodology gate is a self-interrogation tool. For each category, construct a specific scenario in which this file could fail that test — then examine whether the code handles it. If you cannot construct a failure scenario, you must either state the invariant that makes it provably safe, or conclude you have not thought hard enough. "I don't see a problem" is not a cleared category. A category is cleared only when you can name the protection or name the gap.

**Coverage verification (required before every commit):**
Run `npm test -- --coverage` and read the branch/function report. Coverage is not the goal — uncovered branches are test cases you forgot to write. A step is not complete until every branch is reachable.

**Three coverage gaps that appear repeatedly — check these explicitly:**

1. **Comparator and reducer dead code.** If every test returns ≤1 result, `.sort((a,b) => ...)` is never invoked. The same applies to `.reduce((best, m) => condition ? m : best)` — if only one element is ever present, the callback never runs. For any ranking, sort, or reduction, write a synthetic test with exactly two controlled inputs of known relative order and assert which wins. Both the truthy and falsy branches of any `condition ? a : b` comparator must be exercised independently.

2. **Optional array: absent vs. present-but-empty.** `!field` is true on both `undefined` and `[]`. When an optional array field has a non-empty invariant (e.g. `apiTypes`), write two separate tests: one where the field is absent (`undefined`) and one where it is present but empty (`[]`). Both states must be handled correctly.

3. **All parallel member arrays.** When a data shape has multiple parallel member arrays (e.g. `Methods`, `Properties`, `Fields`, `Constructors` on `SboxType`), test each one independently. Testing only Methods and Properties leaves Fields and Constructors as dead code.

4. **Dead guard audit.** For each guard or null-check in the file just written, trace backward to every caller and ask: can any caller actually violate the assumption this guard protects? If no caller can, the guard is dead code — remove it rather than writing a test for it. The coverage gap is the signal; the fix is removal, not a test. Pay particular attention to guards inside private helpers whose only callers already enforce the invariant upstream.

**External assumptions rule:**
Any URL, file path, or network contract that the code depends on must be either (a) tested against a real endpoint before encoding, or (b) explicitly marked in the step's plan as "assumption: verify manually before step N." The CDN discovery mechanism (`sbox.game/api/schema` + crawler UA) is the archetype of an assumption that silently shaped an entire module before being tested.

**Build history note:** Steps 1–8 were completed before the current methodology gate was fully established. Coverage gaps found in those steps during later sessions were expected and are now closed. The gate applies in full from step 9 onward.

**`scripts/demo.js`** is a build smoke test — one check per compiled module to verify `dist/` loads and core paths work. All correctness, edge-case, and error-path coverage belongs exclusively in `npm test`. Do not expand it beyond one assertion per module.

---

## Build Order

Each item is one step. Do not proceed until the current step passes its gate.

1. ✓ **Write `api.fixture.json`** — per Test Fixture Specification. Gate: valid JSON; all coverage cases present; parses cleanly.

2. ✓ **Read all casino source files** — `SYSTEM_PROMPT.md`, `NETWORKING_PROMPT.md`, `UI_PROMPT.md`, `COMMANDS.md`, `SESSION_START.md`, `CLAUDE.md`, `DESIGN_PROMPT.md`, `SBOX_API_REFERENCE.md`. Gate: can accurately describe each file's contents without re-reading.

3. ✓ **Scaffold MCP server** — `package.json`, `tsconfig.json`, `src/types.ts`. Gate: `npm install` succeeds, `tsc --noEmit` passes.

4. ✓ **Write `sanitizer.ts` + tests**. Gate: injection string is sanitized; clean doc string passes through unchanged.

5. ✓ **Write `api-loader.ts` + tests** — streaming index, inverted index, LRU cache. Gate: fixture loads correctly; inverted index resolves `"WorldPanel"` to `Sandbox.UI.WorldPanel`; LRU cache verified.

6. ✓ **Write `api-updater.ts` + tests** — CDN timestamp comparison, local cache management. Gate: mocked newer CDN timestamp returns `updateAvailable: true`; offline mode bypasses all CDN calls.
   Focus: Async Correctness (timeout on CDN requests; no hanging promises on network failure), Resource Lifecycle (stream response to disk; don't hold body in memory), Security (validate CDN response structure before reading fields; path traversal check on cache dir), Robustness (offline mode bypasses all network; unreachable CDN produces a named error with the URL), Test Coverage (offline path; newer/same/older timestamp cases; missing cache directory)

7. ✓ **Write `project-gotchas.ts` + tests** — loads `.claude/gotchas.json` from project root. Gate: entries loaded with `source: "project"`; absent file returns empty array without error.
   Focus: Robustness (missing file → `[]`, not crash; malformed JSON → clear error naming the file), Boundary (empty array, file with zero entries, file with one entry), Security (project root is caller-supplied — validate before use; no path traversal), Test Coverage (file present, file absent, file malformed, source tag = `"project"`)

8. ✓ **Implement `get_api_info` tool + tests**. Gate: correct metadata from fixture; `degraded: true` when no API JSON; `indexReady` reflects build state.
   Focus: Observability (`indexReady`, `typeCount`, `apiDate`, `updateAvailable`, `degraded` all surfaced and accurate), Robustness (`degraded: true` when no API JSON — clean response, not crash), Test Coverage (`indexReady` true/false, `degraded` true/false, `apiDate` present/absent)

9. ✓ **Write `data/gotchas.ts`** with all platform seed entries. Gate: all entries satisfy `Gotcha` interface; structural CI check passes; `apiTypes` entries exist in fixture.
   Focus: Boundary (all 15 seed entries satisfy the `Gotcha` interface; every `apiTypes` value exists in the fixture), Security (no entry references casino-specific or project-specific class names — platform behavior only), Interface (required fields enforced by TypeScript types, not runtime checks)

10. ✓ **Implement `search_gotchas` tool + tests**. Gate: broadcast and proxy entries found; tag-first filtering verified; platform + project sources merged correctly.
    Focus: Test Coverage (platform-only results, project-only results, merged results, tag filter hit, tag filter miss, empty result, source tag preserved on each entry), Algorithmic Complexity (tag filter reduces the candidate set before text search, not after), Interface (source tagging is accurate; `"platform"` vs `"project"` is never mixed)

11. ✓ **Implement `search_sbox_api` tool + tests**. Gate: `"WorldPanel"` returns `Sandbox.UI.WorldPanel` first; `"Camera.Main"` returns zero results; ranking verified.
    Focus: Test Coverage (`WorldPanel` first, `Camera.Main` empty, namespace filter pass/block, before `indexReady`), Security (query string bounds-checked — max length, no null bytes — before reaching loader), Observability (result count and match tier visible in debug mode), Interface (thin wrapper — all search logic lives in ApiLoader, none duplicated here)

12. ✓ **Implement `get_sbox_type` tool + tests** (normal + verbose). Gate: normal mode strips Remarks and member docs; verbose returns full sanitized object; disambiguation returns multiple results with note; sanitizer applied; type not found returns undefined gracefully.
    Focus: Security (sanitizer applied to every doc field before return — explicitly asserted in tests, not assumed from step 11 tests), Test Coverage (all four member arrays — Methods, Properties, Fields, Constructors — tested in both normal and verbose modes; both "no docs" and "injection in docs" cases asserted), Boundary (type with no Documentation; type with no members; type not found)

13. ✓ **Implement `list_namespaces` tool + tests**. Gate: all fixture namespaces returned with correct type counts; degraded mode returns empty array.
    Focus: Algorithmic Complexity (`getNamespaces()` result is used directly — not recomputed per invocation), Test Coverage (correct counts per namespace; degraded mode returns `[]` not crash; verify all 5 fixture namespaces present), Coverage (call the tool twice; confirm result is identical — caching path exercised)

14. ✓ **Wire `index.ts`** — server init, tool registration, startup sequence, debug mode. Gate: server starts; `--debug` creates log file; degraded mode behaves correctly.
    Focus: Async Correctness (startup sequence is ordered; `indexReady` is only set true after full index build, never mid-load), Resource Lifecycle (debug log file handle closed on shutdown; no lingering timers), Robustness (degraded mode starts cleanly; tool calls before `indexReady` return safe well-formed responses), Observability (startup log states file loaded, type count, index build time), Coverage (each startup branch exercised: env var set/unset, cache present/absent, online/offline — each must reach the state it claims to set)

15. ✓ **Write `generate-api-reference.ts`** script. Gate: valid Markdown output with API date header; deterministic (same input → identical output on two runs). Note: output is a developer utility, not a shipped template — see DESIGN.md Phase 3.
    Focus: Resource Lifecycle (write to temp file then atomic rename — output file is never in a truncated/partial state), Boundary (types with no docs render cleanly; empty namespace is skipped gracefully), Interface (output is deterministic — types sorted by FullName), Behavioral gate: run the script against the fixture and diff two consecutive outputs — they must be identical

15.5-A. ✓ **Export `TOOL_DEFINITIONS` + schema unit tests** — `index.ts` exports the constant; `index.test.ts` asserts 5 tools, correct names, non-empty descriptions, `type: "object"` inputSchema, correct `required` arrays for all tools. Caught: `list_namespaces` and `get_api_info` were missing `required: []`.

15.5-B. ✓ **Subprocess MCP wiring test** (`npm run test:e2e`) — spawns `node dist/index.js` with `SBOX_API_JSON` pointing at fixture; completes MCP initialization handshake; verifies `tools/list` returns 5 tools; verifies `tools/call get_api_info` returns valid content response. Lives in `test/e2e/` with separate `jest.e2e.config.js` so `npm test` stays offline and fast. Caught: Node.js 24 SDK import resolution failure — server was completely broken in production until this step.

16. **Write `CLAUDE.md.template`**. Gate: fresh session orients correctly; avoids Unity APIs; asks verbose/normal before building.
    Focus: Security (see Placeholder Injection Defense in DESIGN.md Phase 1), Behavioral gate: load in a Claude session; verify the specific responses named in the gate — `tsc --noEmit` alone is not sufficient

17. **Write `SYSTEM_PROMPT.md.template`**. Gate: Claude writes IsProxy guard, [Sync] property, Rpc.Host→Rpc.Broadcast flow correctly unprompted.
    Focus: same as step 16

18. **Write `NETWORKING_PROMPT.md.template`**. Gate: Claude describes generic pickup/carry ownership transfer pattern without casino class names.
    Focus: same as step 16

19. **Write `UI_PROMPT.md.template`**. Gate: Claude uses `BuildHash()` not `StateHasChanged()`; reads [Sync] directly in Razor; no code-mounted panels.
    Focus: same as step 16

20. **Write remaining templates** one at a time — `DESIGN`, `MAP`, `SESSION_START`, `COMMANDS`. Gate per template: load and verify Claude answers what it's supposed to answer.
    Focus: same as step 16

21. **Write `install.sh` / `install.ps1`** (including `--upgrade` flag). Gate: idempotent (run twice — no duplicates, no errors on second run); `npx` invocation; manifest written with per-file versions and checksums; placeholder substitution validated; `--upgrade` preserves developer customizations below managed-section marker.
    Focus: Boundary (project root with spaces; already-installed state; partial install interrupted mid-run), Security (see Placeholder Injection Defense in DESIGN.md Phase 1), Idempotency explicitly tested — run install, then run install again, verify manifest is not doubled and no files are overwritten with different content

22. **Write `uninstall.sh` / `uninstall.ps1`**. Gate: manifest-listed files removed; developer customizations below the managed-section marker are preserved; `.mcp.json` entry removed without touching other entries.
    Focus: test uninstall *after* install (not standalone); test that customizations below `<!-- END MANAGED SECTION -->` survive; test that a missing manifest is handled gracefully (not a crash)

23. **Write community files** — `README.md`, `CONTRIBUTING.md`, `LICENSE`, `CHANGELOG.md`. Gate: unfamiliar developer can follow README to a working install without any prior knowledge of this repo.

24. **Write GitHub scaffolding** — issue templates, PR template, `ci.yml`, `api-check.yml`. Gate: CI passes on test PR; `api-check.yml` correctly detects a mock "new release" and opens an issue.

25. **Write `CLAUDE.md`** for this repo. Gate: fresh Claude session in this repo knows the build commands, current step, architecture, and one-step rule — without reading any prior conversation.

---

## Verification

After build, install into the casino project and run a full session:
- `get_api_info` reports correct type count, API date, `indexReady: true`
- `search_sbox_api("WorldPanel")` returns `Sandbox.UI.WorldPanel` first
- `get_sbox_type("Component")` normal: signatures only; verbose: full docs
- `search_gotchas("broadcast")` returns platform entry with `confidence: "single-source"` noted
- Project `.claude/gotchas.json` entries appear with `source: "project"`
- `npm test` passes on a machine with no local s&box API JSON
- Install idempotent; uninstall preserves customizations; `--upgrade` preserves customizations
- `--debug` creates a readable log of all tool calls
