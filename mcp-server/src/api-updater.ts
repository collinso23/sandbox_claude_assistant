import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

// ── Constants ──────────────────────────────────────────────────────────────

const CDN_BASE = "https://cdn.sbox.game/releases/";
const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/;
const TIMESTAMP_RE_GLOBAL = /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/g;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".sbox-claude", "api-cache");

// ── Public types ───────────────────────────────────────────────────────────

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestTimestamp: string | undefined;
  currentTimestamp: string | undefined;
  downloadUrl: string | undefined;
}

export type FetchFn = typeof fetch;

// ── ApiUpdater ─────────────────────────────────────────────────────────────

export class ApiUpdater {
  private readonly cacheDir: string;
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;

  constructor(options: { cacheDir?: string; fetch?: FetchFn; timeoutMs?: number } = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  async ensureCacheDir(): Promise<void> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  getNewestCachedFile(): { filePath: string | undefined; timestamp: string | undefined } {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.cacheDir);
    } catch {
      return { filePath: undefined, timestamp: undefined };
    }

    const timestamped = entries
      .filter((f) => f.endsWith(".zip.json"))
      .map((f) => ({ file: f, ts: TIMESTAMP_RE.exec(f)?.[0] }))
      .filter((e): e is { file: string; ts: string } => e.ts !== undefined)
      .sort((a, b) => b.ts.localeCompare(a.ts)); // newest first

    if (timestamped.length === 0) return { filePath: undefined, timestamp: undefined };
    const newest = timestamped[0];
    return { filePath: path.join(this.cacheDir, newest.file), timestamp: newest.ts };
  }

  async checkForUpdate(currentTimestamp?: string): Promise<UpdateCheckResult> {
    const notAvailable: UpdateCheckResult = {
      updateAvailable: false,
      latestTimestamp: undefined,
      currentTimestamp,
      downloadUrl: undefined,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let responseText: string;
    try {
      const response = await this.fetchFn(CDN_BASE, { signal: controller.signal });
      if (!response.ok) return notAvailable;
      responseText = await response.text();
    } catch {
      // Offline, unreachable, or aborted — not an error, just no update info
      return notAvailable;
    } finally {
      clearTimeout(timer);
    }

    const matches = responseText.match(TIMESTAMP_RE_GLOBAL) ?? [];
    if (matches.length === 0) return notAvailable;

    const latest = [...new Set(matches)].sort().at(-1)!;
    const updateAvailable = currentTimestamp === undefined || latest > currentTimestamp;

    return {
      updateAvailable,
      latestTimestamp: latest,
      currentTimestamp,
      downloadUrl: updateAvailable ? `${CDN_BASE}${latest}.zip.json` : undefined,
    };
  }

  async downloadLatest(timestamp: string): Promise<string> {
    await this.ensureCacheDir();

    const url = `${CDN_BASE}${timestamp}.zip.json`;
    const finalPath = path.join(this.cacheDir, `${timestamp}.zip.json`);
    const tmpPath = `${finalPath}.tmp`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Download failed: ${url} returned HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error(`Download failed: ${url} returned no response body`);
      }

      const nodeStream = Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0]
      );
      const writer = fs.createWriteStream(tmpPath);
      await pipeline(nodeStream, writer);
      await fs.promises.rename(tmpPath, finalPath);
      return finalPath;
    } catch (err) {
      try { await fs.promises.unlink(tmpPath); } catch {}
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  resolveApiPath():
    | { filePath: string; source: "env" | "cache" }
    | { filePath: undefined; source: undefined } {
    const envPath = process.env["SBOX_API_JSON"];
    if (envPath) return { filePath: envPath, source: "env" };

    const { filePath } = this.getNewestCachedFile();
    if (filePath) return { filePath, source: "cache" };

    return { filePath: undefined, source: undefined };
  }
}
