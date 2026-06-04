import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/components/notification/NotificationBanner.tsx"),
  "utf8",
);
const helperSource = readFileSync(
  join(
    process.cwd(),
    "src/services/notifications/announcementNotifications.ts",
  ),
  "utf8",
);

test("notification banner surfaces active announcements through app-only notifications", () => {
  assert.match(source, /surfaceAppAnnouncementNotifications/);
  assert.match(helperSource, /appNotificationService/);
  assert.match(helperSource, /announcement/);
  assert.match(
    helperSource,
    /dedupeKey: `announcement:\$\{notification\.id\}`/,
  );
});
