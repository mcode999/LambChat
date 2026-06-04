export type AppNotificationRuntime =
  | "tauri"
  | "capacitor-android"
  | "unsupported";

export type AppNotificationType =
  | "task"
  | "announcement"
  | "approval"
  | "message"
  | "auth"
  | "error";

export interface AppNotificationPayload {
  type: AppNotificationType;
  title: string;
  body?: string;
  route?: string;
  dedupeKey?: string;
  importance?: "normal" | "high";
}

export type AppNotificationPermission = "granted" | "denied";

export type AppNotificationResult =
  | "delivered"
  | "deduped"
  | "unsupported"
  | "permission-denied"
  | "failed";

interface BrowserLocationLike {
  protocol?: string;
  hostname?: string;
}

interface CapacitorGlobalLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

interface AppNotificationGlobalLike {
  Capacitor?: CapacitorGlobalLike;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

export interface DetectAppNotificationRuntimeOptions {
  locationLike?: BrowserLocationLike | null;
  globalLike?: AppNotificationGlobalLike | null;
}

export interface AppNotificationAdapter {
  requestPermission: () => Promise<AppNotificationPermission>;
  notify: (payload: AppNotificationPayload) => Promise<void>;
}

export interface AppNotificationServiceOptions {
  runtime?: AppNotificationRuntime;
  adapters?: {
    tauri?: AppNotificationAdapter;
    capacitorAndroid?: AppNotificationAdapter;
  };
  onNavigate?: (route: string) => void;
  onWarning?: (message: string, error?: unknown) => void;
}

export interface AppNotificationService {
  notify: (payload: AppNotificationPayload) => Promise<AppNotificationResult>;
  requestPermission: () => Promise<AppNotificationPermission | "unsupported">;
  getRuntime: () => AppNotificationRuntime;
  clearDedupe: () => void;
  setNavigator: (navigator: ((route: string) => void) | null) => void;
  initializeNativeClickHandlers: () => void;
}

export function detectAppNotificationRuntime(
  options: DetectAppNotificationRuntimeOptions = {},
): AppNotificationRuntime {
  const globalObject =
    options.globalLike ??
    (typeof globalThis !== "undefined"
      ? (globalThis as AppNotificationGlobalLike)
      : null);

  if (globalObject?.__TAURI__ || globalObject?.__TAURI_INTERNALS__) {
    return "tauri";
  }

  const capacitor = globalObject?.Capacitor;
  if (
    capacitor?.isNativePlatform?.() &&
    capacitor?.getPlatform?.() === "android"
  ) {
    return "capacitor-android";
  }

  const location =
    options.locationLike ??
    (typeof window !== "undefined" ? window.location : null);
  const protocol = location?.protocol?.toLowerCase() || "";
  const hostname = location?.hostname?.toLowerCase() || "";

  if (protocol === "tauri:" || hostname === "tauri.localhost") {
    return "tauri";
  }
  if (protocol === "capacitor:") {
    return "capacitor-android";
  }

  return "unsupported";
}

function resolveAdapter(
  runtime: AppNotificationRuntime,
  adapters: AppNotificationServiceOptions["adapters"],
): AppNotificationAdapter | null {
  if (runtime === "tauri") return adapters?.tauri ?? createTauriAdapter();
  if (runtime === "capacitor-android") {
    return adapters?.capacitorAndroid ?? createCapacitorAndroidAdapter();
  }
  return null;
}

export function createAppNotificationService(
  options: AppNotificationServiceOptions = {},
): AppNotificationService {
  const runtime = options.runtime ?? detectAppNotificationRuntime();
  const deliveredKeys = new Set<string>();
  let navigate = options.onNavigate ?? null;
  let clickHandlersInitialized = false;
  const warn =
    options.onWarning ??
    ((message: string, error?: unknown) => {
      console.warn(message, error);
    });

  const getAdapter = () => resolveAdapter(runtime, options.adapters);

  return {
    getRuntime() {
      return runtime;
    },
    clearDedupe() {
      deliveredKeys.clear();
    },
    setNavigator(navigator) {
      navigate = navigator;
    },
    initializeNativeClickHandlers() {
      if (clickHandlersInitialized || runtime !== "capacitor-android") return;
      clickHandlersInitialized = true;
      void import("@capacitor/local-notifications")
        .then(({ LocalNotifications }) =>
          LocalNotifications.addListener(
            "localNotificationActionPerformed",
            (payload) => {
              const route = payload.notification.extra?.route;
              if (typeof route === "string" && route && navigate) {
                navigate(route);
              }
            },
          ),
        )
        .catch((error) => {
          warn("[AppNotification] Native click handler failed", error);
        });
    },
    async requestPermission() {
      const adapter = getAdapter();
      if (!adapter) return "unsupported";
      try {
        return await adapter.requestPermission();
      } catch (error) {
        warn("[AppNotification] Permission request failed", error);
        return "denied";
      }
    },
    async notify(payload) {
      const adapter = getAdapter();
      if (!adapter) return "unsupported";

      if (payload.dedupeKey && deliveredKeys.has(payload.dedupeKey)) {
        return "deduped";
      }

      const permission = await this.requestPermission();
      if (permission !== "granted") return "permission-denied";

      try {
        await adapter.notify(payload);
        if (payload.dedupeKey) deliveredKeys.add(payload.dedupeKey);
        return "delivered";
      } catch (error) {
        warn("[AppNotification] Native notification failed", error);
        return "failed";
      }
    },
  };
}

export const appNotificationService = createAppNotificationService();

function createTauriAdapter(): AppNotificationAdapter {
  return {
    async requestPermission() {
      const notification = await import("@tauri-apps/plugin-notification");
      const permission = await notification.requestPermission();
      return permission === "granted" ? "granted" : "denied";
    },
    async notify(payload) {
      const notification = await import("@tauri-apps/plugin-notification");
      notification.sendNotification({
        title: payload.title,
        body: payload.body,
      });
    },
  };
}

function createCapacitorAndroidAdapter(): AppNotificationAdapter {
  return {
    async requestPermission() {
      const { LocalNotifications } = await import(
        "@capacitor/local-notifications"
      );
      const permission = await LocalNotifications.requestPermissions();
      return permission.display === "granted" ? "granted" : "denied";
    },
    async notify(payload) {
      const { LocalNotifications } = await import(
        "@capacitor/local-notifications"
      );
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationIdFromPayload(payload),
            title: payload.title,
            body: payload.body || "",
            extra: {
              route: payload.route,
              type: payload.type,
              dedupeKey: payload.dedupeKey,
            },
          },
        ],
      });
    },
  };
}

function notificationIdFromPayload(payload: AppNotificationPayload): number {
  const source = payload.dedupeKey || `${payload.type}:${payload.title}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
