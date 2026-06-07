import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/components/layout/AppContent/AppShell.tsx"),
  "utf8",
);

test("app shell mounts the notification banner so announcements surface on web and app", () => {
  assert.match(source, /NotificationBanner/);
  assert.match(source, /<NotificationBanner\s*\/>/);
});
