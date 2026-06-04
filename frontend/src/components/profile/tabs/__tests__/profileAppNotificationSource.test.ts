import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/components/profile/tabs/ProfileNotificationTab.tsx"),
  "utf8",
);

test("profile notification settings expose the app-only notification service", () => {
  assert.match(source, /appNotificationService/);
  assert.match(source, /requestPermission/);
  assert.match(source, /getRuntime/);
});
