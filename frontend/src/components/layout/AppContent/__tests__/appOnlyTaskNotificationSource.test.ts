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
  assert.match(source, /isAppNotificationRuntime/);
  assert.match(source, /!isAppNotificationRuntime/);
  assert.match(source, /appNotificationService\.notify/);
});
