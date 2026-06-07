import type { ApiLoader } from "../api-loader";
import type { ApiUpdater } from "../api-updater";

export interface ApiInfoResponse {
  loaded: boolean;
  indexReady: boolean;
  typeCount: number;
  apiDate: string | undefined;
  cacheDir: string;
  updateAvailable: boolean;
  namespaces: Array<{ namespace: string; count: number }>;
  degraded: boolean;
  debugMode: boolean;
}

export interface GetApiInfoDeps {
  loader: ApiLoader | undefined;
  updater: ApiUpdater;
  updateAvailable: boolean;
  debugMode: boolean;
}

export function getApiInfo(deps: GetApiInfoDeps): ApiInfoResponse {
  const { loader, updater, updateAvailable, debugMode } = deps;

  const loaded = loader !== undefined;
  const indexReady = loader?.indexReady ?? false;
  const degraded = !loaded;

  const namespaces: Array<{ namespace: string; count: number }> = [];
  if (indexReady && loader) {
    for (const [namespace, count] of loader.getNamespaces()) {
      namespaces.push({ namespace, count });
    }
    namespaces.sort((a, b) => a.namespace.localeCompare(b.namespace));
  }

  return {
    loaded,
    indexReady,
    typeCount: loader?.typeCount ?? 0,
    apiDate: loader?.apiDate,
    cacheDir: updater.getCacheDir(),
    updateAvailable,
    namespaces,
    degraded,
    debugMode,
  };
}
