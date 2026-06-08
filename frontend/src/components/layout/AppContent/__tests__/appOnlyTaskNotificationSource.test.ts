import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "src/components/layout/AppContent/useWebSocketNotifications.tsx",
  ),
  "utf8",
);

test("task notifications skip browser notification delivery in native app runtimes", () => {
  assert.match(
    source,
    /const isAppNotificationRuntime =\s+appNotificationRuntime !== "unsupported";/,
  );
  assert.match(source, /!isAppNotificationRuntime/);
  assert.match(source, /appNotificationService\.notify/);
});

test("task notifications attempt app delivery before suppressing active-session surfaces", () => {
  assert.match(source, /shouldAttemptAppTaskNotification/);
  assert.match(source, /const shouldAttemptAppNotification/);
  assert.match(
    source,
    /if \(!shouldSurface && !shouldAttemptAppNotification\)/,
  );
});

test("task notifications do not show stale toasts while the page is hidden", () => {
  assert.match(source, /if \(visibilityState !== "visible"\) \{/);
  assert.match(source, /const toastDuration = notificationCopy\.isSuccess/);
});
