import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

// ── Constants ──────────────────────────────────────────────────────────────

const CDN_BASE = "https://cdn.sbox.game/releases/";
// Blazor Server pre-renders the page only for known crawler UAs; a standard
// browser UA returns an empty JS shell with no CDN URL visible in the HTML.
export const SCHEMA_PAGE = "https://sbox.game/api/schema";
export const CRAWLER_UA =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/;
const TIMESTAMP_RE_GLOBAL = /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/g;
// More specific than TIMESTAMP_RE_GLOBAL — validates domain + path before extracting timestamp
const CDN_URL_RE =
  /https:\/\/cdn\.sbox\.game\/releases\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.zip\.json/g;
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
      const response = await this.fetchFn(SCHEMA_PAGE, {
        headers: { "User-Agent": CRAWLER_UA },
        signal: controller.signal,
      });
      if (!response.ok) return notAvailable;
      responseText = await response.text();
    } catch {
      // Offline, unreachable, or aborted — not an error, just no update info
      return notAvailable;
    } finally {
      clearTimeout(timer);
    }

    const cdnUrlMatches = [...responseText.matchAll(CDN_URL_RE)];
    if (cdnUrlMatches.length === 0) return notAvailable;

    // Pick the entry with the latest timestamp (capture group 1)
    const latest = cdnUrlMatches.reduce((best, m) =>
      m[1] > best[1] ? m : best
    );
    const latestTimestamp = latest[1];
    const latestUrl = latest[0];
    const updateAvailable = currentTimestamp === undefined || latestTimestamp > currentTimestamp;

    return {
      updateAvailable,
      latestTimestamp,
      currentTimestamp,
      downloadUrl: updateAvailable ? latestUrl : undefined,
    };
  }

  async downloadLatest(url: string): Promise<string> {
    if (!url.startsWith(CDN_BASE)) {
      throw new Error(`Refused download from unexpected URL: ${url}`);
    }
    const timestamp = TIMESTAMP_RE.exec(url)?.[0];
    if (!timestamp) {
      throw new Error(`No timestamp found in download URL: ${url}`);
    }

    await this.ensureCacheDir();

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
