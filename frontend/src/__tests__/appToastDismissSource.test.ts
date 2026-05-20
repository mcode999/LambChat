import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(import.meta.dirname, "../App.tsx"), {
  encoding: "utf8",
});

test("global toaster gives default toasts a dismiss button without wrapping custom toasts", () => {
  assert.match(appSource, /ToastBar/);
  assert.match(appSource, /currentToast\.type === "custom"/);
  assert.match(appSource, /toast\.dismiss\(currentToast\.id\)/);
  assert.match(appSource, /aria-label=\{t\("common\.dismiss"/);
  assert.match(appSource, /flex w-full items-center gap-3 text-left/);
});
