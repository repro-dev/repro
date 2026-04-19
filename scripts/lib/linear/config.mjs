import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseLinearConfig(text) {
  const config = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key) config[key] = value;
  }

  return config;
}

function readLinearConfig(filePath, fsImpl = fs) {
  try {
    return parseLinearConfig(fsImpl.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function pickTrimmed(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function formatLinearConfig({ apiKey, team }) {
  return [`api_key=${apiKey}`, `team=${team}`, ""].join("\n");
}

export function resolveLinearConfig({
  cwd = process.cwd(),
  repoRoot = cwd,
  homeDir = os.homedir(),
  env = process.env,
  fsImpl = fs,
} = {}) {
  const globalConfig = readLinearConfig(path.join(homeDir, ".linear"), fsImpl);
  const localConfig = readLinearConfig(path.join(repoRoot, ".linear"), fsImpl);

  return {
    apiKey:
      pickTrimmed(env.LINEAR_API_KEY) ||
      localConfig.api_key ||
      globalConfig.api_key ||
      "",
    team:
      pickTrimmed(env.LINEAR_TEAM) ||
      localConfig.team ||
      globalConfig.team ||
      "",
  };
}

export function writeLinearConfig({
  cwd = process.cwd(),
  repoRoot = cwd,
  fsImpl = fs,
  apiKey,
  team,
}) {
  const filePath = path.join(repoRoot, ".linear");
  fsImpl.writeFileSync(
    filePath,
    formatLinearConfig({
      apiKey: pickTrimmed(apiKey),
      team: pickTrimmed(team),
    }),
    "utf8",
  );
  return filePath;
}

export { parseLinearConfig };
