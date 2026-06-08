#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import * as os from "os";
import * as path from "path";
import { initialize, handleToolCall, runBackgroundCheck } from "./server";

const DEFAULT_LOG_PATH = path.join(os.homedir(), ".sbox-claude", "debug.log");

const TOOL_DEFINITIONS = [
  {
    name: "search_sbox_api",
    description:
      "Search the s&box C# API by type name, namespace, or keyword. Returns a ranked list of matching types with their members.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query — type name, namespace, or keyword",
        },
        namespace: {
          type: "string",
          description: "Restrict results to an exact namespace (e.g. 'Sandbox.UI')",
        },
        verbose: {
          type: "boolean",
          description: "Include member documentation in results (default false)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_sbox_type",
    description:
      "Get full details for a single s&box type by name or full name. Returns all members and documentation. Use the full name to disambiguate when multiple types share a short name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Type short name (e.g. 'Component') or full name (e.g. 'Sandbox.Component')",
        },
        verbose: {
          type: "boolean",
          description: "Include member documentation in results (default false)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_namespaces",
    description:
      "List all namespaces in the s&box API with their type counts, sorted alphabetically. Use this to explore the API surface or to find the correct namespace for a search.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "search_gotchas",
    description:
      "Search the s&box gotcha database for common mistakes and their correct patterns. Returns platform gotchas from this server and project gotchas from the developer's own .claude/gotchas.json.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Keyword or tag to search for (e.g. 'networking', 'rpc', 'physics'). Leave empty to list all gotchas.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_api_info",
    description:
      "Get metadata about the loaded s&box API schema: load state, type count, API date, available namespaces, and whether an update is available from the CDN.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--update")) {
    const { ApiUpdater } = await import("./api-updater");
    const updater = new ApiUpdater();
    const { downloadUrl } = await updater.checkForUpdate();
    if (!downloadUrl) {
      console.log("Already up to date.");
      return;
    }
    await updater.ensureCacheDir();
    const saved = await updater.downloadLatest(downloadUrl);
    console.log(`Downloaded: ${saved}`);
    return;
  }

  const state = await initialize({ args });
  let updateAvailable = false;

  void runBackgroundCheck(
    state.updater,
    state.loader?.apiDate,
    (available) => {
      updateAvailable = available;
    },
    state.debugMode,
    DEFAULT_LOG_PATH
  ).catch(() => {});

  const server = new Server(
    { name: "@sbox-claude/mcp-server", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      state,
      updateAvailable
    ) as any
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
