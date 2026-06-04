import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readGit(command, fallback) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const outputPath = resolve("client/public/deploy-check.json");
const payload = {
  buildTime: new Date().toISOString(),
  commit: readGit("git rev-parse --short HEAD", "unknown"),
  bundle: "vite-client-bundle",
  environment: process.env.DEPLOY_ENV || process.env.NODE_ENV || "production",
  feature: "monthly-close-v2-phase-1",
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
