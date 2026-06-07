import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function readRepoFile(path: string): string {
  const url = new URL(`../../../../../${path}`, import.meta.url);
  return readFileSync(url, "utf8");
}

test("release workflow publishes branded desktop and mobile artifacts", () => {
  const workflowPath = ".github/workflows/app-release.yml";
  assert.equal(
    existsSync(new URL(`../../../../../${workflowPath}`, import.meta.url)),
    true,
  );

  const workflow = readRepoFile(workflowPath);
  assert.match(workflow, /LambChat-/);
  assert.match(workflow, /package:desktop/);
  assert.match(workflow, /assembleRelease/);
  assert.match(workflow, /softprops\/action-gh-release/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /-workspace App\.xcworkspace/);
  assert.match(workflow, /CARGO_BUILD_JOBS/);
  assert.match(workflow, /pnpm config set store-dir D:\\pnpm-store/);
  assert.match(workflow, /npm_config_cache=D:\\npm-cache/);
  assert.doesNotMatch(workflow, /CARGO_TARGET_DIR:/);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.match(workflow, /runner: windows-2022/);
  assert.match(workflow, /frontend\/src-tauri\/target\/release\/bundle/);
  assert.doesNotMatch(workflow, /find frontend -type f/);
  assert.doesNotMatch(workflow, /-name '\*\.exe'/);
  assert.doesNotMatch(workflow, /mapfile/);
});

test("release workflow publishes a debug Android APK when signing secrets are missing", () => {
  const workflow = readRepoFile(".github/workflows/app-release.yml");

  assert.doesNotMatch(workflow, /LambChat-android-[^\n]*release-unsigned\.apk/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /app-debug\.apk/);
  assert.match(workflow, /LambChat-android-\$\{RELEASE_TAG\}-debug\.apk/);
  assert.match(workflow, /LambChat-android-\$\{RELEASE_TAG\}-signed\.apk/);
});

test("mobile package scripts generate and validate branded native images", () => {
  const packageJson = JSON.parse(readRepoFile("frontend/package.json")) as {
    scripts: Record<string, string>;
  };
  const assetScript = readRepoFile(
    "frontend/scripts/generate-branded-assets.mjs",
  );
  const packagedBuildScript = readRepoFile(
    "frontend/scripts/build-packaged-frontend.mjs",
  );

  assert.match(packageJson.scripts["packaged:build"], /brand:assets/);
  assert.match(
    packageJson.scripts["packaged:build"],
    /build-packaged-frontend/,
  );
  assert.match(packageJson.scripts["mobile:sync"], /packaged:build/);
  assert.match(packageJson.scripts["mobile:sync:ios"], /cap sync ios/);
  assert.equal(packageJson.scripts["mobile:ios:variant"], undefined);
  assert.match(packageJson.scripts["mobile:build"], /packaged:build/);
  assert.match(packageJson.scripts["brand:assets"], /generate-branded-assets/);
  assert.match(packageJson.scripts["brand:assets:check"], /--check/);
  assert.match(packagedBuildScript, /VITE_API_BASE:\s*normalizedAppUrl/);
  assert.match(packagedBuildScript, /LAMBCHAT_APP_URL:\s*normalizedAppUrl/);
  assert.match(assetScript, /LambChat/);
  assert.match(assetScript, /public\/icons\/icon-512\.png/);
  assert.match(assetScript, /scalePngNearest/);
  assert.match(assetScript, /1024/);
});

test("iOS release builds only the modern package line", () => {
  const packageJson = JSON.parse(readRepoFile("frontend/package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const podfile = readRepoFile("frontend/ios/App/Podfile");
  const project = readRepoFile(
    "frontend/ios/App/App.xcodeproj/project.pbxproj",
  );
  const infoPlist = readRepoFile("frontend/ios/App/App/Info.plist");
  const workflow = readRepoFile(".github/workflows/app-release.yml");

  assert.equal(packageJson.dependencies["@capacitor/core"], "7.6.5");
  assert.equal(
    packageJson.dependencies["@capacitor/local-notifications"],
    "^7.0.6",
  );
  assert.equal(packageJson.devDependencies["@capacitor/cli"], "7.6.5");
  assert.equal(packageJson.devDependencies["@capacitor/ios"], "7.6.5");
  assert.match(podfile, /platform :ios, '14\.0'/);
  assert.match(podfile, /@capacitor\+ios@7\.6\.5_@capacitor\+core@7\.6\.5/);
  assert.match(
    podfile,
    /@capacitor\+local-notifications@7\.0\.6_@capacitor\+core@7\.6\.5/,
  );
  assert.equal(
    [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);/g)].every(
      ([, target]) => target === "14.0",
    ),
    true,
  );
  assert.match(infoPlist, /<string>arm64<\/string>/);
  assert.doesNotMatch(infoPlist, /<string>armv7<\/string>/);
  assert.doesNotMatch(workflow, /legacy-ios12/);
  assert.doesNotMatch(workflow, /iOS 12/);
  assert.doesNotMatch(workflow, /@capacitor\/core@3\.9\.0/);
  assert.doesNotMatch(workflow, /@capacitor\/ios@3\.9\.0/);
  assert.match(workflow, /pnpm mobile:sync:ios/);
  assert.match(workflow, /pod install/);
  assert.match(workflow, /-destination generic\/platform=iOS/);
  assert.match(workflow, /archive/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow, /CODE_SIGNING_REQUIRED=NO/);
  assert.match(workflow, /CODE_SIGN_IDENTITY=""/);
  assert.match(
    workflow,
    /LambChat-ios-\$\{RELEASE_TAG\}-unsigned-xcarchive\.zip/,
  );
});

test("desktop package script bundles the frontend before Tauri packaging", () => {
  const script = readRepoFile("frontend/scripts/package-desktop.mjs");

  assert.match(script, /VITE_API_BASE:\s*normalizedAppUrl/);
  assert.match(script, /LAMBCHAT_APP_URL:\s*normalizedAppUrl/);
  assert.doesNotMatch(script, /spawnSync\(pnpmCommand, \["build"\]/);
  assert.doesNotMatch(script, /spawnSync\(pnpmCommand, \["packaged:build"\]/);
  assert.match(script, /tauriCliPackage = "@tauri-apps\/cli@2\.11\.2"/);
  assert.match(script, /"icon", "public\/icons\/icon-512\.png"/);
  assert.match(script, /TAURI_BUNDLES/);
  assert.doesNotMatch(script, /pake-cli/);
  assert.doesNotMatch(script, /PAKE_TARGETS/);
});

test("desktop package uses committed Tauri project and branded icons", () => {
  const config = readRepoFile("frontend/src-tauri/tauri.conf.json");
  const cargo = readRepoFile("frontend/src-tauri/Cargo.toml");

  assert.match(config, /"productName": "LambChat"/);
  assert.match(config, /"frontendDist": "\.\.\/dist"/);
  assert.match(config, /"beforeBuildCommand": "pnpm packaged:build"/);
  assert.match(config, /"icons\/icon\.ico"/);
  assert.match(config, /"icons\/icon\.icns"/);
  assert.match(cargo, /tauri = \{ version = "2\.11\.2"/);
  assert.match(readRepoFile(".gitignore"), /frontend\/src-tauri\/icons\//);
});
