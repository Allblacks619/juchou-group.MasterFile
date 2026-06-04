import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function readGit(command, fallback) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function detectClientBundle() {
  const assetsDir = resolve("dist/public/assets");
  if (!existsSync(assetsDir)) {
    return { bundle: "unknown", detectedClientAssets: [], detectionNote: "dist/public/assets was not found; run this script after vite build." };
  }

  const jsAssets = readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => ({ fileName, size: statSync(join(assetsDir, fileName)).size }))
    .sort((a, b) => b.size - a.size || a.fileName.localeCompare(b.fileName));

  const entryBundle = jsAssets.find((asset) => /^index-[A-Za-z0-9_-]+\.js$/.test(asset.fileName));

  return {
    bundle: entryBundle?.fileName || "unknown",
    detectedClientAssets: jsAssets.map((asset) => asset.fileName),
    detectionNote: entryBundle
      ? "Detected the largest hashed index-*.js client entry bundle from dist/public/assets after Vite build."
      : "No hashed index-*.js client entry bundle was detected in dist/public/assets.",
  };
}

const detected = detectClientBundle();
const payload = {
  buildTime: new Date().toISOString(),
  commit: readGit("git rev-parse --short HEAD", "unknown"),
  environment: process.env.DEPLOY_ENV || process.env.NODE_ENV || "production",
  feature: "monthly-close-v2-phase-1",
  bundle: detected.bundle,
  detectedClientAssets: detected.detectedClientAssets,
  detectionNote: detected.detectionNote,
};

const outputPaths = [resolve("client/public/deploy-check.json"), resolve("dist/public/deploy-check.json")];
for (const outputPath of outputPaths) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}
