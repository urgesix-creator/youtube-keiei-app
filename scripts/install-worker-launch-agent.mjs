import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const label = "com.youtube-keiei.chrome-worker";
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const artifactDir = path.join(projectRoot, "worker-artifacts");
const domain = `gui/${process.getuid()}`;

if (process.argv.includes("--uninstall")) {
  run("launchctl", ["bootout", domain, plistPath], { allowFailure: true });
  rmSync(plistPath, { force: true });
  console.log(`LaunchAgentを削除しました: ${plistPath}`);
  process.exit(0);
}

mkdirSync(launchAgentsDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

run("launchctl", ["bootout", domain, plistPath], { allowFailure: true });
writeFileSync(plistPath, buildPlist(), "utf8");
run("launchctl", ["bootstrap", domain, plistPath]);
run("launchctl", ["kickstart", "-k", `${domain}/${label}`]);

console.log(`LaunchAgentを設定しました: ${plistPath}`);

function buildPlist() {
  const nodePath = process.execPath;
  const envFile = path.join(projectRoot, ".env.worker");
  const workerFile = path.join(projectRoot, "workers", "chrome-worker.mjs");
  const stdoutPath = path.join(artifactDir, "chrome-worker.launchd.log");
  const stderrPath = path.join(artifactDir, "chrome-worker.launchd.err.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>--env-file=${escapeXml(envFile)}</string>
    <string>${escapeXml(workerFile)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(projectRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
