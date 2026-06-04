import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appSource = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
const serviceSource = readFileSync(
  join(process.cwd(), "src/services/notifications/appNotificationService.ts"),
  "utf8",
);

test("App registers native notification route navigation inside the router", () => {
  assert.match(appSource, /appNotificationService\.setNavigator/);
  assert.match(appSource, /initializeNativeClickHandlers/);
});

test("app notification service handles Capacitor local notification clicks", () => {
  assert.match(serviceSource, /localNotificationActionPerformed/);
  assert.match(serviceSource, /payload\.notification\.extra\?\.route/);
});
