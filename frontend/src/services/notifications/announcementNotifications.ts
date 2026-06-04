import type { Notification } from "../../types/notification";
import { appNotificationService } from "./appNotificationService";

export function surfaceAppAnnouncementNotifications(
  notifications: Notification[],
  lang: keyof Notification["title_i18n"],
) {
  notifications.forEach((notification) => {
    const title = notification.title_i18n[lang] || notification.title_i18n.en;
    const body =
      notification.content_i18n[lang] || notification.content_i18n.en;
    void appNotificationService.notify({
      type: "announcement",
      title,
      body,
      route: "/notifications",
      dedupeKey: `announcement:${notification.id}`,
      importance:
        notification.type === "warning" || notification.type === "maintenance"
          ? "high"
          : "normal",
    });
  });
}
