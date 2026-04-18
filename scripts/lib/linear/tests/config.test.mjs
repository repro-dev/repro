import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveLinearConfig, writeLinearConfig } from "../config.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "linear-config-"));
}

test("resolveLinearConfig prefers env over local and global files", () => {
  const tmp = makeTempDir();
  const home = path.join(tmp, "home");
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });

  fs.writeFileSync(
    path.join(home, ".linear"),
    ["api_key=global-key", "team=GLOBAL"].join("\n"),
  );
  fs.writeFileSync(
    path.join(repo, ".linear"),
    ["# local overrides global", "api_key=local-key", "team=LOCAL"].join("\n"),
  );

  const config = resolveLinearConfig({
    cwd: repo,
    homeDir: home,
    env: { LINEAR_API_KEY: "env-key", LINEAR_TEAM: "ENV" },
  });

  assert.equal(config.apiKey, "env-key");
  assert.equal(config.team, "ENV");
});

test("resolveLinearConfig falls back to local then global files", () => {
  const tmp = makeTempDir();
  const home = path.join(tmp, "home");
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });

  fs.writeFileSync(
    path.join(home, ".linear"),
    "api_key=global-key\nteam=GLOBAL\n",
  );
  fs.writeFileSync(
    path.join(repo, ".linear"),
    "api_key=local-key\nteam=LOCAL\n",
  );

  const config = resolveLinearConfig({ cwd: repo, homeDir: home, env: {} });

  assert.equal(config.apiKey, "local-key");
  assert.equal(config.team, "LOCAL");
});

test("resolveLinearConfig tolerates comments and whitespace", () => {
  const tmp = makeTempDir();
  const home = path.join(tmp, "home");
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });

  fs.writeFileSync(
    path.join(repo, ".linear"),
    ["  # comment", " api_key = trimmed ", "", " team = REP "].join("\n"),
  );

  const config = resolveLinearConfig({ cwd: repo, homeDir: home, env: {} });

  assert.equal(config.apiKey, "trimmed");
  assert.equal(config.team, "REP");
});

test("writeLinearConfig writes the local repo config format", () => {
  const writes = [];
  const fsImpl = {
    writeFileSync(filePath, contents, encoding) {
      writes.push({ filePath, contents, encoding });
    },
  };

  const cwd = path.join(makeTempDir(), "repo");
  const filePath = writeLinearConfig({
    cwd,
    fsImpl,
    apiKey: "api",
    team: "REP",
  });

  assert.equal(filePath, path.join(cwd, ".linear"));
  assert.deepEqual(writes, [
    {
      filePath: path.join(cwd, ".linear"),
      contents: "api_key=api\nteam=REP\n",
      encoding: "utf8",
    },
  ]);
});
