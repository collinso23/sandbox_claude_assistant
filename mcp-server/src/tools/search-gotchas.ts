import type { Gotcha } from "../types";

export interface SearchGotchasDeps {
  platformGotchas: Gotcha[];
  projectGotchas: Gotcha[];
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_/.,;:]+/).filter((t) => t.length > 0);
}

function scoreText(g: Gotcha, tokens: string[]): number {
  let score = 0;
  const id = g.id.toLowerCase();
  const title = g.title.toLowerCase();
  const wrongReason = g.wrongReason.toLowerCase();
  const fixReason = g.fixReason.toLowerCase();
  for (const token of tokens) {
    if (id.includes(token)) score += 2;
    if (title.includes(token)) score += 3;
    if (wrongReason.includes(token)) score += 1;
    if (fixReason.includes(token)) score += 1;
  }
  return score;
}

export function searchGotchas(deps: SearchGotchasDeps, query: string): Gotcha[] {
  const all = [...deps.platformGotchas, ...deps.projectGotchas];

  if (query.trim().length === 0) {
    return all;
  }

  const tokens = tokenize(query);
  const allTags = new Set(all.flatMap((g) => g.tags));

  const tagTokens = tokens.filter((t) => allTags.has(t));
  const textTokens = tokens.filter((t) => !allTags.has(t));

  // Phase 1: tag filter reduces candidate set before text scoring
  const candidates =
    tagTokens.length > 0
      ? all.filter((g) => g.tags.some((t) => tagTokens.includes(t)))
      : all;

  // Phase 2: text scoring on remaining tokens
  if (textTokens.length === 0) {
    return candidates;
  }

  return candidates
    .map((g) => ({ g, score: scoreText(g, textTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.g);
}
