import * as fs from "fs";
import * as path from "path";
import type { ApiRoot, SboxType } from "./types";

// ── LRU Cache ──────────────────────────────────────────────────────────────

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Promote to most-recent by deleting and re-inserting
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

function validate(data: unknown): asserts data is ApiRoot {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid API JSON: root is not an object");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj["Types"])) {
    throw new Error("Invalid API JSON: root must have a Types array");
  }
  if ((obj["Types"] as unknown[]).length === 0) {
    throw new Error("Invalid API JSON: Types array is empty");
  }
  for (const entry of obj["Types"] as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Invalid API JSON: type entry is not an object");
    }
    const e = entry as Record<string, unknown>;
    if (!e["Name"] || !e["FullName"] || !e["Namespace"] || !e["Group"]) {
      throw new Error(
        "Invalid API JSON: type entry missing required fields (Name, FullName, Namespace, Group)"
      );
    }
  }
}

// ── Tokenisation ───────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  const tokens = new Set<string>();
  const addPart = (part: string) => {
    if (!part) return;
    tokens.add(part.toLowerCase());
    for (const cp of part.split(/(?=[A-Z])/)) {
      if (cp) tokens.add(cp.toLowerCase());
    }
  };
  for (const dotPart of s.split(".")) addPart(dotPart);
  for (const word of s.split(/\s+/)) addPart(word);
  return [...tokens].filter((t) => t.length > 0);
}

// ── ApiLoader ──────────────────────────────────────────────────────────────

const API_DATE_RE = /^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/;

export class ApiLoader {
  private readonly types = new Map<string, SboxType>();
  private readonly nameIndex = new Map<string, SboxType[]>();
  private readonly invertedIndex = new Map<string, Set<string>>();
  private readonly cache: LruCache<string, SboxType>;

  private _indexReady = false;
  private _typeCount = 0;
  private _apiDate: string | undefined;
  private _namespacesCache: Map<string, number> | undefined;

  constructor(lruSize = 100) {
    this.cache = new LruCache<string, SboxType>(lruSize);
  }

  get indexReady(): boolean { return this._indexReady; }
  get typeCount(): number { return this._typeCount; }
  get apiDate(): string | undefined { return this._apiDate; }
  get cacheSize(): number { return this.cache.size; }

  async load(filePath: string): Promise<void> {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const data: unknown = JSON.parse(raw);
    validate(data);

    const dateMatch = API_DATE_RE.exec(path.basename(filePath));
    this._apiDate = dateMatch?.[1];

    for (const type of data.Types) {
      this.types.set(type.FullName, type);

      const existing = this.nameIndex.get(type.Name);
      if (existing) existing.push(type);
      else this.nameIndex.set(type.Name, [type]);

      this.indexType(type);
    }

    this._typeCount = this.types.size;
    this._indexReady = true;
  }

  private indexType(type: SboxType): void {
    const add = (token: string) => {
      const t = token.toLowerCase();
      let set = this.invertedIndex.get(t);
      if (!set) { set = new Set(); this.invertedIndex.set(t, set); }
      set.add(type.FullName);
    };
    for (const t of tokenize(type.FullName)) add(t);
    for (const t of tokenize(type.Name)) add(t);
  }

  getByFullName(fullName: string): SboxType | undefined {
    const cached = this.cache.get(fullName);
    if (cached) return cached;
    const type = this.types.get(fullName);
    if (type) { this.cache.set(fullName, type); return type; }
    return undefined;
  }

  getByName(name: string): SboxType[] {
    return this.nameIndex.get(name) ?? [];
  }

  search(query: string, namespace?: string): SboxType[] {
    if (!this._indexReady) return [];

    const filter = (results: SboxType[]) =>
      namespace ? results.filter((t) => t.Namespace === namespace) : results;

    // 1. Exact FullName
    const exactFull = this.types.get(query);
    if (exactFull) return filter([exactFull]);

    // 2. Exact Name, unambiguous
    const byName = this.nameIndex.get(query);
    if (byName && byName.length === 1) return filter(byName);

    // 3. Dot-notation AND: every dot-segment must be a token on the same type
    if (query.includes(".")) {
      const segments = query.split(".");
      let matchSet: Set<string> | null = null;
      for (const seg of segments) {
        const found = this.invertedIndex.get(seg.toLowerCase()) ?? new Set<string>();
        if (matchSet === null) {
          matchSet = new Set(found);
        } else {
          for (const fn of [...matchSet]) {
            if (!found.has(fn)) matchSet.delete(fn);
          }
        }
      }
      const results = [...matchSet!]
        .map((fn) => this.types.get(fn))
        .filter((t): t is SboxType => t !== undefined);
      return filter(results);
    }

    // 4. Token OR search, ranked by match count
    const queryTokens = tokenize(query);
    const scores = new Map<string, number>();
    for (const token of queryTokens) {
      for (const fn of this.invertedIndex.get(token) ?? []) {
        scores.set(fn, (scores.get(fn) ?? 0) + 1);
      }
    }
    const results = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fn]) => this.types.get(fn))
      .filter((t): t is SboxType => t !== undefined);

    return filter(results);
  }

  getAllTypes(): SboxType[] {
    return [...this.types.values()];
  }

  getNamespaces(): Map<string, number> {
    if (this._namespacesCache) return this._namespacesCache;
    const ns = new Map<string, number>();
    for (const type of this.types.values()) {
      ns.set(type.Namespace, (ns.get(type.Namespace) ?? 0) + 1);
    }
    this._namespacesCache = ns;
    return ns;
  }
}
