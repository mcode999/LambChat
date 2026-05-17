import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const welcomePageSource = readFileSync(
  resolve(currentDir, "../WelcomePage.tsx"),
  "utf8",
);
const animatedWebp = readFileSync(
  resolve(currentDir, "../../../../public/images/lamb.webp"),
);

test("embeds the transparent animated welcome icon WebP as the welcome icon image", () => {
  assert.match(welcomePageSource, /WELCOME_ICON_SRC/);
  assert.match(welcomePageSource, /\/images\/lamb\.webp/);
  assert.match(
    welcomePageSource,
    /<img[\s\S]*src=\{WELCOME_ICON_SRC\}[\s\S]*className=\{className\}/,
  );
  assert.doesNotMatch(
    welcomePageSource,
    /<img[\s\S]*src="\/icons\/icon\.svg"[\s\S]*className="welcome-icon/,
  );
  assert.doesNotMatch(welcomePageSource, /<video/);
  assert.match(animatedWebp.toString("latin1"), /ANMF/);
  assert.ok(
    (animatedWebp.toString("latin1").match(/ANMF/g)?.length ?? 0) >= 120,
    "welcome icon WebP should preserve nearly all frames from the source GIF",
  );
  assert.ok(
    !welcomePageSource.match(/className="welcome-icon[^"]*rounded-full/),
    "welcome icon should keep the asset's transparent silhouette instead of CSS circle clipping",
  );
});
