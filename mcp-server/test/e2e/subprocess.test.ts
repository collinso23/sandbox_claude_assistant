import * as cp from "child_process";
import * as path from "path";

jest.setTimeout(15000);

const FIXTURE_PATH = path.join(__dirname, "../fixtures/api.fixture.json");
const SERVER_PATH = path.join(__dirname, "../../dist/index.js");

// ── Minimal MCP stdio client ──────────────────────────────────────────────
// Sends newline-delimited JSON-RPC 2.0 messages to the server's stdin and
// matches responses by id. No external dependencies beyond child_process.

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpTestClient {
  private child: cp.ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    { resolve: (r: JsonRpcResponse) => void }
  >();
  private nextId = 1;
  private buffer = "";

  constructor() {
    this.child = cp.spawn("node", [SERVER_PATH], {
      env: { ...process.env, SBOX_API_JSON: FIXTURE_PATH },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          if (msg.id !== undefined) {
            const handler = this.pending.get(msg.id);
            if (handler) {
              this.pending.delete(msg.id);
              handler.resolve(msg);
            }
          }
        } catch {
          // ignore non-JSON output (e.g. debug lines on stderr)
        }
      }
    });
  }

  private send(message: object): void {
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  request(method: string, params?: object): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.send({ jsonrpc: "2.0", id, method, params: params ?? {} });
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    // Notification — no response expected
    this.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  }

  kill(): void {
    this.child.kill();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("MCP server — subprocess wiring", () => {
  let client: McpTestClient;

  beforeAll(async () => {
    client = new McpTestClient();
    await client.initialize();
  });

  afterAll(() => {
    client.kill();
  });

  it("tools/list returns exactly 5 tools with the expected names", async () => {
    const response = await client.request("tools/list");
    expect(response.error).toBeUndefined();
    const tools = (response.result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).toContain("search_sbox_api");
    expect(names).toContain("get_sbox_type");
    expect(names).toContain("list_namespaces");
    expect(names).toContain("search_gotchas");
    expect(names).toContain("get_api_info");
  });

  it("tools/call get_api_info returns a valid MCP content response", async () => {
    const response = await client.request("tools/call", {
      name: "get_api_info",
      arguments: {},
    });
    expect(response.error).toBeUndefined();
    const result = response.result as {
      content: { type: string; text: string }[];
    };
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    // Verify the payload is valid JSON with the expected shape
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed).toHaveProperty("loaded");
  });
});
