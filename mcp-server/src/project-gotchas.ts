import * as fs from "fs";
import * as path from "path";
import type { Gotcha } from "./types";

const GOTCHAS_RELATIVE_PATH = path.join(".claude", "gotchas.json");

export async function loadProjectGotchas(projectRoot: string): Promise<Gotcha[]> {
  const resolvedRoot = path.resolve(projectRoot);
  const filePath = path.join(resolvedRoot, GOTCHAS_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(
      `Invalid JSON in project gotchas: ${filePath} — ${(err as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid project gotchas: ${filePath} — root must be an array`);
  }

  const entries: Gotcha[] = [];
  for (const entry of parsed as unknown[]) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `Invalid project gotchas: ${filePath} — each entry must be an object`
      );
    }
    // Force source to "project" regardless of what the file claims
    entries.push({ ...(entry as Gotcha), source: "project" });
  }

  return entries;
}
