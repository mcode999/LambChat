import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldAttemptAppTaskNotification,
  shouldAttemptBrowserNotification,
  shouldSurfaceTaskNotification,
} from "../taskNotificationGuards.ts";

test("does not surface task notifications for the visible active session", () => {
  assert.equal(
    shouldSurfaceTaskNotification({
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    false,
  );
});

test("surfaces task notifications for inactive or hidden sessions", () => {
  assert.equal(
    shouldSurfaceTaskNotification({
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    true,
  );
  assert.equal(
    shouldSurfaceTaskNotification({
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    true,
  );
});

test("attempts browser notifications only after permission is granted and the task should surface", () => {
  assert.equal(
    shouldAttemptBrowserNotification({
      isSupported: true,
      cachedPermission: "granted",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    true,
  );
  assert.equal(
    shouldAttemptBrowserNotification({
      isSupported: true,
      cachedPermission: "granted",
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    true,
  );
  assert.equal(
    shouldAttemptBrowserNotification({
      isSupported: true,
      cachedPermission: "granted",
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    false,
  );
  assert.equal(
    shouldAttemptBrowserNotification({
      isSupported: true,
      cachedPermission: "default",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    false,
  );
  assert.equal(
    shouldAttemptBrowserNotification({
      isSupported: false,
      cachedPermission: "granted",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    false,
  );
});

test("does not attempt app task notifications for the visible active session", () => {
  assert.equal(
    shouldAttemptAppTaskNotification({
      appRuntime: "capacitor-android",
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    false,
  );
});

test("attempts app task notifications for other sessions while the native app is visible", () => {
  assert.equal(
    shouldAttemptAppTaskNotification({
      appRuntime: "tauri",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "visible",
    }),
    true,
  );
});

test("attempts app task notifications when the native app is hidden", () => {
  assert.equal(
    shouldAttemptAppTaskNotification({
      appRuntime: "capacitor-android",
      notificationSessionId: "session-1",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    true,
  );
  assert.equal(
    shouldAttemptAppTaskNotification({
      appRuntime: "tauri",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    true,
  );
});

test("does not attempt app task notifications when native notifications are unsupported", () => {
  assert.equal(
    shouldAttemptAppTaskNotification({
      appRuntime: "unsupported",
      notificationSessionId: "session-2",
      currentSessionId: "session-1",
      visibilityState: "hidden",
    }),
    false,
  );
});
