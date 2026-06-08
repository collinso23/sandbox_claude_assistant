#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ApiLoader } from "./api-loader";
import { ApiUpdater } from "./api-updater";
import { sanitize } from "./sanitizer";
import type { SboxType, SboxMethod, SboxProperty, SboxField, SboxConstructor } from "./types";

// ── Member formatters ──────────────────────────────────────────────────────

function formatParams(params: { Name: string; Type: string }[]): string {
  return params.map((p) => `${p.Type} ${p.Name}`).join(", ");
}

function formatMethod(m: SboxMethod): string {
  const sig = `\`${m.ReturnType} ${m.Name}(${formatParams(m.Parameters)})\``;
  const summary = sanitize(m.Documentation?.Summary);
  return summary ? `- ${sig} — ${summary}` : `- ${sig}`;
}

function formatProperty(p: SboxProperty): string {
  const accessors: string[] = [];
  if (p.GetAccess === "Public") accessors.push("get;");
  if (p.SetAccess === "Public") accessors.push("set;");
  const accessStr = accessors.length > 0 ? ` { ${accessors.join(" ")} }` : "";
  const sig = `\`${p.PropertyType} ${p.Name}${accessStr}\``;
  const summary = sanitize(p.Documentation?.Summary);
  return summary ? `- ${sig} — ${summary}` : `- ${sig}`;
}

function formatField(f: SboxField): string {
  const valueStr = f.Value !== undefined ? ` = \`${f.Value}\`` : "";
  const sig = `\`${f.Name}\`${valueStr}`;
  const summary = sanitize(f.Documentation?.Summary);
  return summary ? `- ${sig} — ${summary}` : `- ${sig}`;
}

function formatConstructor(c: SboxConstructor): string {
  const sig = `\`(${formatParams(c.Parameters)})\``;
  const summary = sanitize(c.Documentation?.Summary);
  return summary ? `- ${sig} — ${summary}` : `- ${sig}`;
}

// ── Type renderer ──────────────────────────────────────────────────────────

function renderType(type: SboxType): string[] {
  const lines: string[] = [];

  const groupLabel = type.IsAbstract ? `abstract ${type.Group}` : type.Group;
  lines.push(`### ${type.Name}`);
  lines.push(`**Group:** ${groupLabel} | **Namespace:** ${type.Namespace} | **Assembly:** ${type.Assembly}`);
  if (type.BaseType) lines.push(`**Extends:** \`${type.BaseType}\``);

  const summary = sanitize(type.Documentation?.Summary);
  if (summary) lines.push(`**Summary:** ${summary}`);

  const publicMethods = (type.Methods ?? []).filter((m) => m.IsPublic);
  if (publicMethods.length > 0) {
    lines.push("");
    lines.push("**Methods:**");
    for (const m of publicMethods) lines.push(formatMethod(m));
  }

  const publicProps = (type.Properties ?? []).filter((p) => p.IsPublic);
  if (publicProps.length > 0) {
    lines.push("");
    lines.push("**Properties:**");
    for (const p of publicProps) lines.push(formatProperty(p));
  }

  const publicFields = (type.Fields ?? []).filter((f) => f.IsPublic);
  if (publicFields.length > 0) {
    lines.push("");
    lines.push("**Fields:**");
    for (const f of publicFields) lines.push(formatField(f));
  }

  const publicCtors = (type.Constructors ?? []).filter((c) => c.IsPublic);
  if (publicCtors.length > 0) {
    lines.push("");
    lines.push("**Constructors:**");
    for (const c of publicCtors) lines.push(formatConstructor(c));
  }

  return lines;
}

// ── Core generation ────────────────────────────────────────────────────────

export async function generate(loader: ApiLoader, outputPath: string): Promise<void> {
  // Group by namespace
  const byNamespace = new Map<string, SboxType[]>();
  for (const type of loader.getAllTypes()) {
    const existing = byNamespace.get(type.Namespace);
    if (existing) existing.push(type);
    else byNamespace.set(type.Namespace, [type]);
  }

  // Sort namespaces and types within each namespace
  const sortedNamespaces = [...byNamespace.keys()].sort();
  for (const ns of sortedNamespaces) {
    byNamespace.get(ns)!.sort((a, b) => a.FullName.localeCompare(b.FullName));
  }

  const lines: string[] = [];
  lines.push("# S&box API Reference");
  lines.push(`<!-- Generated from API ${loader.apiDate ?? "unknown"} — do not edit -->`);

  for (const ns of sortedNamespaces) {
    const types = byNamespace.get(ns)!;
    lines.push("");
    lines.push(`## ${ns}`);

    for (const type of types) {
      lines.push("");
      lines.push(...renderType(type));
      lines.push("");
      lines.push("---");
    }
  }

  lines.push("");

  const content = lines.join("\n");
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, outputPath);
}

// ── CLI entry point ────────────────────────────────────────────────────────

/* istanbul ignore next */
async function main(): Promise<void> {
  const updater = new ApiUpdater();
  const { filePath } = updater.resolveApiPath();

  if (!filePath) {
    process.stderr.write(
      "[generate-api-reference] No s&box API JSON found.\nRun: npx @sbox-claude/mcp-server --update\n"
    );
    process.exit(1);
  }

  const loader = new ApiLoader();
  await loader.load(filePath);

  const outputPath =
    process.argv[2] ??
    path.join(os.homedir(), ".sbox-claude", "SBOX_API_REFERENCE.md");

  await generate(loader, outputPath);
  console.log(`Written: ${outputPath}`);
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
