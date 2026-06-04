import assert from "node:assert/strict";
import test from "node:test";

import {
  createAppNotificationService,
  detectAppNotificationRuntime,
} from "../appNotificationService.ts";

test("detects Tauri before Capacitor so desktop app uses the Tauri adapter", () => {
  assert.equal(
    detectAppNotificationRuntime({
      locationLike: { protocol: "capacitor:" },
      globalLike: {
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "android",
        },
        __TAURI_INTERNALS__: {},
      },
    }),
    "tauri",
  );
});

test("detects Capacitor Android for native Android builds", () => {
  assert.equal(
    detectAppNotificationRuntime({
      locationLike: { protocol: "https:" },
      globalLike: {
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "android",
        },
      },
    }),
    "capacitor-android",
  );
});

test("treats ordinary web runtimes as unsupported", () => {
  assert.equal(
    detectAppNotificationRuntime({
      locationLike: { protocol: "https:", hostname: "chat.example.com" },
      globalLike: {},
    }),
    "unsupported",
  );
});

test("delivers a normalized payload through the selected native adapter", async () => {
  const delivered: unknown[] = [];
  const service = createAppNotificationService({
    runtime: "tauri",
    adapters: {
      tauri: {
        async requestPermission() {
          return "granted";
        },
        async notify(payload) {
          delivered.push(payload);
        },
      },
    },
  });

  const result = await service.notify({
    type: "task",
    title: "Design Review",
    body: "Task completed",
    route: "/chat/session-1",
    dedupeKey: "task:run-1",
    importance: "high",
  });

  assert.equal(result, "delivered");
  assert.deepEqual(delivered, [
    {
      type: "task",
      title: "Design Review",
      body: "Task completed",
      route: "/chat/session-1",
      dedupeKey: "task:run-1",
      importance: "high",
    },
  ]);
});

test("deduplicates repeated notifications with the same dedupe key", async () => {
  let count = 0;
  const service = createAppNotificationService({
    runtime: "capacitor-android",
    adapters: {
      capacitorAndroid: {
        async requestPermission() {
          return "granted";
        },
        async notify() {
          count += 1;
        },
      },
    },
  });

  assert.equal(
    await service.notify({
      type: "message",
      title: "New reply",
      dedupeKey: "message:session-1:5",
    }),
    "delivered",
  );
  assert.equal(
    await service.notify({
      type: "message",
      title: "New reply",
      dedupeKey: "message:session-1:5",
    }),
    "deduped",
  );
  assert.equal(count, 1);
});

test("does not deliver app-only notifications on unsupported web runtimes", async () => {
  const service = createAppNotificationService({
    runtime: "unsupported",
    adapters: {},
  });

  assert.equal(
    await service.notify({
      type: "announcement",
      title: "Maintenance",
      route: "/notifications",
    }),
    "unsupported",
  );
});

test("reports permission denial without calling the native adapter", async () => {
  let delivered = false;
  const service = createAppNotificationService({
    runtime: "tauri",
    adapters: {
      tauri: {
        async requestPermission() {
          return "denied";
        },
        async notify() {
          delivered = true;
        },
      },
    },
  });

  assert.equal(
    await service.notify({
      type: "auth",
      title: "Permission needed",
    }),
    "permission-denied",
  );
  assert.equal(delivered, false);
});
