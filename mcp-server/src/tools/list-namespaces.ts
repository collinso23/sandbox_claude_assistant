import type { ApiLoader } from "../api-loader";

export interface ListNamespacesDeps {
  loader: ApiLoader | undefined;
}

export interface NamespaceEntry {
  namespace: string;
  typeCount: number;
}

export function listNamespaces(deps: ListNamespacesDeps): NamespaceEntry[] {
  if (!deps.loader || !deps.loader.indexReady) return [];
  return [...deps.loader.getNamespaces().entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([namespace, typeCount]) => ({ namespace, typeCount }));
}
