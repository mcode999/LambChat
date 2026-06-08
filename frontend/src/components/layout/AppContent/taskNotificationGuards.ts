import type { AppNotificationRuntime } from "../../../services/notifications/appNotificationService";

export interface TaskNotificationSurfaceInput {
  notificationSessionId: string;
  currentSessionId: string | null;
  visibilityState: DocumentVisibilityState;
}

export interface AppTaskNotificationAttemptInput {
  appRuntime: AppNotificationRuntime;
  notificationSessionId: string;
  currentSessionId: string | null;
  visibilityState: DocumentVisibilityState;
}

export interface BrowserNotificationAttemptInput {
  isSupported: boolean;
  cachedPermission: NotificationPermission;
  notificationSessionId: string;
  currentSessionId: string | null;
  visibilityState: DocumentVisibilityState;
}

export function shouldSurfaceTaskNotification({
  notificationSessionId,
  currentSessionId,
  visibilityState,
}: TaskNotificationSurfaceInput): boolean {
  return !(
    currentSessionId === notificationSessionId && visibilityState === "visible"
  );
}

export function shouldAttemptBrowserNotification({
  isSupported,
  cachedPermission,
  notificationSessionId,
  currentSessionId,
  visibilityState,
}: BrowserNotificationAttemptInput): boolean {
  return (
    isSupported &&
    cachedPermission === "granted" &&
    shouldSurfaceTaskNotification({
      notificationSessionId,
      currentSessionId,
      visibilityState,
    })
  );
}

export function shouldAttemptAppTaskNotification({
  appRuntime,
  notificationSessionId,
  currentSessionId,
  visibilityState,
}: AppTaskNotificationAttemptInput): boolean {
  return (
    appRuntime !== "unsupported" &&
    shouldSurfaceTaskNotification({
      notificationSessionId,
      currentSessionId,
      visibilityState,
    })
  );
}
