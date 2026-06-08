import test from "node:test";
import assert from "node:assert/strict";

import {
  buildApiUrl,
  buildUploadProxyUrl,
  buildUploadProxyUrlFromKey,
  buildWebSocketUrl,
  getFullUrl,
  isNativeAppRuntime,
} from "../config.ts";

test("buildApiUrl keeps same-origin deployments relative", () => {
  assert.equal(buildApiUrl("/api/health", ""), "/api/health");
});

test("buildApiUrl prefixes relative backend paths for packaged apps", () => {
  assert.equal(
    buildApiUrl("/api/health", "https://chat.example.com/"),
    "https://chat.example.com/api/health",
  );
});

test("getFullUrl prefers the configured backend for relative file URLs", () => {
  assert.equal(
    getFullUrl("/api/upload/file/report.pdf", "https://chat.example.com"),
    "https://chat.example.com/api/upload/file/report.pdf",
  );
});

test("buildUploadProxyUrl leaves upload proxy URLs unchanged on web", () => {
  assert.equal(
    buildUploadProxyUrl(
      "/api/upload/file/revealed_files/report.pdf",
      "https://chat.example.com",
    ),
    "https://chat.example.com/api/upload/file/revealed_files/report.pdf",
  );
});

test("buildUploadProxyUrl appends proxy mode to upload proxy URLs in native apps", () => {
  assert.equal(
    buildUploadProxyUrl(
      "/api/upload/file/revealed_files/report.pdf",
      "https://chat.example.com",
      { locationLike: { protocol: "capacitor:" } },
    ),
    "https://chat.example.com/api/upload/file/revealed_files/report.pdf?proxy=true",
  );
});

test("buildUploadProxyUrl preserves existing query params in native apps", () => {
  assert.equal(
    buildUploadProxyUrl(
      "https://chat.example.com/api/upload/file/revealed_files/report.pdf?download=0",
      "",
      { locationLike: { protocol: "tauri:" } },
    ),
    "https://chat.example.com/api/upload/file/revealed_files/report.pdf?download=0&proxy=true",
  );
});

test("buildUploadProxyUrl leaves non-upload URLs unchanged", () => {
  assert.equal(
    buildUploadProxyUrl(
      "https://oss.example.com/revealed_files/report.pdf",
      "",
      {
        locationLike: { protocol: "capacitor:" },
      },
    ),
    "https://oss.example.com/revealed_files/report.pdf",
  );
});

test("buildUploadProxyUrlFromKey keeps native app image URLs web-compatible by default", () => {
  assert.equal(
    buildUploadProxyUrlFromKey(
      "revealed files/report 1.pdf",
      "https://chat.example.com",
      {
        locationLike: { protocol: "capacitor:" },
      },
    ),
    "https://chat.example.com/api/upload/file/revealed%20files/report%201.pdf",
  );
});

test("buildUploadProxyUrlFromKey can force proxy mode for native content fetches", () => {
  assert.equal(
    buildUploadProxyUrlFromKey(
      "revealed files/report 1.pdf",
      "https://chat.example.com",
      {
        force: true,
        locationLike: { protocol: "https:" },
      },
    ),
    "https://chat.example.com/api/upload/file/revealed%20files/report%201.pdf?proxy=true",
  );
});

test("isNativeAppRuntime detects native webview origins and bridges", () => {
  assert.equal(isNativeAppRuntime({ protocol: "capacitor:" }), true);
  assert.equal(isNativeAppRuntime({ protocol: "https:" }), false);
  assert.equal(
    isNativeAppRuntime(
      { protocol: "https:" },
      { Capacitor: { isNativePlatform: () => true } },
    ),
    true,
  );
});

test("buildWebSocketUrl points packaged apps at the configured backend", () => {
  assert.equal(
    buildWebSocketUrl("/ws", "https://chat.example.com"),
    "wss://chat.example.com/ws",
  );
});

test("buildWebSocketUrl keeps same-origin browser deployments on window host", () => {
  assert.equal(
    buildWebSocketUrl("/ws", "", {
      protocol: "http:",
      host: "localhost:3001",
    }),
    "ws://localhost:3001/ws",
  );
});
