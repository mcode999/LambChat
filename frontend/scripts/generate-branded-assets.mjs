import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const checkOnly = process.argv.includes("--check");
const brandIconPath = resolve("public/icons/icon-512.png");
const brandIcon = readFileSync(brandIconPath);

const targets = [
  "resources/icon.png",
  "resources/splash.png",
  "android/app/src/main/res/drawable/splash.png",
  "android/app/src/main/res/drawable-land-hdpi/splash.png",
  "android/app/src/main/res/drawable-land-mdpi/splash.png",
  "android/app/src/main/res/drawable-land-xhdpi/splash.png",
  "android/app/src/main/res/drawable-land-xxhdpi/splash.png",
  "android/app/src/main/res/drawable-land-xxxhdpi/splash.png",
  "android/app/src/main/res/drawable-port-hdpi/splash.png",
  "android/app/src/main/res/drawable-port-mdpi/splash.png",
  "android/app/src/main/res/drawable-port-xhdpi/splash.png",
  "android/app/src/main/res/drawable-port-xxhdpi/splash.png",
  "android/app/src/main/res/drawable-port-xxxhdpi/splash.png",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png",
];

function ensureSameContent(targetPath) {
  const fullPath = resolve(targetPath);
  if (!existsSync(fullPath)) {
    return false;
  }
  return readFileSync(fullPath).equals(brandIcon);
}

let invalidCount = 0;

for (const target of targets) {
  if (checkOnly) {
    if (!ensureSameContent(target)) {
      console.error(`Brand asset is missing or stale: ${target}`);
      invalidCount += 1;
    }
    continue;
  }

  const fullPath = resolve(target);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, brandIcon);
}

if (invalidCount > 0) {
  console.error(
    `Found ${invalidCount} native image asset(s) that do not use the LambChat brand icon.`,
  );
  process.exit(1);
}

if (!checkOnly) {
  console.log(`Generated ${targets.length} LambChat branded native assets.`);
}
