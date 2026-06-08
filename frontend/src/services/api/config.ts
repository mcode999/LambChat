/**
 * API configuration and URL utilities
 */

const configuredApiBase =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE || "";

function normalizeApiBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, "");
}

const API_BASE = normalizeApiBase(configuredApiBase);
export { API_BASE };

export interface BrowserLocationLike {
  protocol: string;
  host: string;
  hostname?: string;
}

interface NativeRuntimeGlobalLike {
  Capacitor?: { isNativePlatform?: () => boolean };
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

export function buildApiUrl(path: string, apiBase: string = API_BASE): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBase = normalizeApiBase(apiBase);
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
}

export function buildWebSocketUrl(
  path: string = "/ws",
  apiBase: string = API_BASE,
  locationLike?: BrowserLocationLike,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBase = normalizeApiBase(apiBase);

  if (normalizedBase) {
    const url = new URL(normalizedPath, normalizedBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  const location =
    locationLike || (typeof window !== "undefined" ? window.location : null);
  if (!location) {
    return normalizedPath;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${normalizedPath}`;
}

/**
 * 获取完整 URL（用于处理后端返回的相对路径）
 * @param url - 可能是相对路径或完整 URL
 * @returns 完整 URL
 */
export function getFullUrl(
  url: string | undefined | null,
  apiBase: string = API_BASE,
): string | undefined {
  if (!url) return undefined;
  // 如果已经是完整 URL（http:// 或 https://），直接返回
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (apiBase) {
    return buildApiUrl(url, apiBase);
  }
  // 如果是相对路径，拼接 base URL（优先使用当前 origin，否则使用 API_BASE）
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  return baseUrl + url;
}

export function isNativeAppRuntime(
  locationLike?: Partial<BrowserLocationLike> | null,
  globalLike?: NativeRuntimeGlobalLike | null,
): boolean {
  const location =
    locationLike || (typeof window !== "undefined" ? window.location : null);
  const globalObject =
    globalLike ||
    (typeof globalThis !== "undefined"
      ? (globalThis as NativeRuntimeGlobalLike)
      : null);

  if (globalObject?.Capacitor?.isNativePlatform?.()) {
    return true;
  }
  if (globalObject?.__TAURI__ || globalObject?.__TAURI_INTERNALS__) {
    return true;
  }

  const protocol = location?.protocol?.toLowerCase() || "";
  const hostname = location?.hostname?.toLowerCase() || "";
  return (
    protocol === "capacitor:" ||
    protocol === "ionic:" ||
    protocol === "tauri:" ||
    hostname === "tauri.localhost"
  );
}

function encodeUploadObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function buildUploadProxyUrl(
  url: string | undefined | null,
  apiBase: string = API_BASE,
  options: {
    force?: boolean;
    locationLike?: Partial<BrowserLocationLike> | null;
    globalLike?: NativeRuntimeGlobalLike | null;
  } = {},
): string | undefined {
  const fullUrl = getFullUrl(url, apiBase) || url || undefined;
  if (!fullUrl) return undefined;
  if (
    !options.force &&
    !isNativeAppRuntime(options.locationLike, options.globalLike)
  ) {
    return fullUrl;
  }

  const fallbackBase =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";

  try {
    const parsed = new URL(fullUrl, fallbackBase);
    if (!parsed.pathname.startsWith("/api/upload/file/")) {
      return fullUrl;
    }
    parsed.searchParams.set("proxy", "true");
    return parsed.toString();
  } catch {
    return fullUrl;
  }
}

export function buildUploadProxyUrlFromKey(
  key: string | undefined | null,
  apiBase: string = API_BASE,
  options: Parameters<typeof buildUploadProxyUrl>[2] = {},
): string | undefined {
  if (!key) return undefined;
  const url = buildApiUrl(
    `/api/upload/file/${encodeUploadObjectKey(key)}`,
    apiBase,
  );
  return options.force ? buildUploadProxyUrl(url, apiBase, options) : url;
}
