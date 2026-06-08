import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader } from "./api-loader";
import { ApiUpdater } from "./api-updater";
import { loadProjectGotchas } from "./project-gotchas";
import { PLATFORM_GOTCHAS } from "./data/gotchas";
import { searchSboxApi } from "./tools/search-api";
import { getSboxType } from "./tools/get-sbox-type";
import { listNamespaces } from "./tools/list-namespaces";
import { searchGotchas } from "./tools/search-gotchas";
import { getApiInfo } from "./tools/get-api-info";
import type { Gotcha } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const API_TOOLS = new Set(["search_sbox_api", "get_sbox_type", "list_namespaces"]);

// ── Public types ───────────────────────────────────────────────────────────

export interface ServerConfig {
  args?: string[];
  cacheDir?: string;
  fetch?: typeof globalThis.fetch;
  projectRoot?: string;
  logPath?: string;
  stderr?: { write(s: string): void };
}

export interface ServerState {
  loader: ApiLoader | undefined;
  updater: ApiUpdater;
  debugMode: boolean;
  projectGotchas: Gotcha[];
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
}

// ── initialize ─────────────────────────────────────────────────────────────

export async function initialize(config: ServerConfig = {}): Promise<ServerState> {
  const args = config.args ?? process.argv.slice(2);
  const debugMode = args.includes("--debug");
  const logPath = config.logPath ?? path.join(os.homedir(), ".sbox-claude", "debug.log");
  const errOut = config.stderr ?? process.stderr;

  const updaterOpts: ConstructorParameters<typeof ApiUpdater>[0] = {};
  if (config.cacheDir !== undefined) updaterOpts.cacheDir = config.cacheDir;
  if (config.fetch !== undefined) updaterOpts.fetch = config.fetch;
  const updater = new ApiUpdater(updaterOpts);

  const { filePath } = updater.resolveApiPath();

  let loader: ApiLoader | undefined;

  if (filePath !== undefined) {
    const start = Date.now();
    loader = new ApiLoader();
    await loader.load(filePath);
    const elapsed = Date.now() - start;
    if (debugMode) {
      const ts = new Date().toISOString();
      fs.appendFileSync(
        logPath,
        `[${ts}] Loaded ${filePath}: ${loader.typeCount} types in ${elapsed}ms\n`,
        "utf8"
      );
    }
  } else {
    errOut.write(
      "[sbox-claude] WARNING: No s&box API data found. API search and type lookup tools will be unavailable.\nRun: npx @sbox-claude/mcp-server --update\n"
    );
    if (debugMode) {
      const ts = new Date().toISOString();
      fs.appendFileSync(logPath, `[${ts}] No API JSON — degraded mode\n`, "utf8");
    }
  }

  const projectGotchas = await loadProjectGotchas(config.projectRoot ?? process.cwd());

  return { loader, updater, debugMode, projectGotchas };
}

// ── runBackgroundCheck ─────────────────────────────────────────────────────

export async function runBackgroundCheck(
  updater: ApiUpdater,
  apiDate: string | undefined,
  onResult: (available: boolean) => void,
  debugMode: boolean,
  logPath: string
): Promise<void> {
  try {
    const result = await updater.checkForUpdate(apiDate);
    onResult(result.updateAvailable);
    if (debugMode && result.updateAvailable) {
      const ts = new Date().toISOString();
      fs.appendFileSync(
        logPath,
        `[${ts}] Update available: ${result.latestTimestamp}\n`,
        "utf8"
      );
    }
  } catch {
    // offline-first: CDN failures are silent
  }
}

// ── handleToolCall ─────────────────────────────────────────────────────────

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  state: ServerState,
  updateAvailable: boolean
): Promise<ToolCallResult> {
  if (!state.loader && API_TOOLS.has(name)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            warning:
              "s&box API data is not loaded. Run `npx @sbox-claude/mcp-server --update` to download the API schema, then restart.",
            result: null,
          }),
        },
      ],
    };
  }

  const json = (v: unknown): ToolCallResult => ({
    content: [{ type: "text" as const, text: JSON.stringify(v) }],
  });

  switch (name) {
    case "search_sbox_api":
      return json(
        searchSboxApi({ loader: state.loader }, String(args["query"] ?? ""), {
          namespace:
            typeof args["namespace"] === "string" ? args["namespace"] : undefined,
          verbose: args["verbose"] === true,
        })
      );

    case "get_sbox_type":
      return json(
        getSboxType({ loader: state.loader }, String(args["name"] ?? ""), {
          verbose: args["verbose"] === true,
        }) ?? null
      );

    case "list_namespaces":
      return json(listNamespaces({ loader: state.loader }));

    case "search_gotchas":
      return json(
        searchGotchas(
          { platformGotchas: PLATFORM_GOTCHAS, projectGotchas: state.projectGotchas },
          String(args["query"] ?? "")
        )
      );

    case "get_api_info":
      return json(
        getApiInfo({
          loader: state.loader,
          updater: state.updater,
          updateAvailable,
          debugMode: state.debugMode,
        })
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
