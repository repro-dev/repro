import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getConfigValue,
  listConfigItems,
  setConfigValue,
  unsetConfigValue,
} from "../runtime";

test("config values persist repo-scoped settings", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-config-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  try {
    assert.equal(getConfigValue("engine.auto-discover").value, "off");
    assert.equal(getConfigValue("engine.tick-frequency").value, 15);
    setConfigValue("engine.auto-discover", "on");
    assert.equal(getConfigValue("engine.auto-discover").value, "on");
    assert.equal(
      listConfigItems()
        .map((item) => item.key)
        .includes("engine.tick-frequency"),
      true,
    );
    setConfigValue("engine.tick-frequency", "20");
    assert.equal(getConfigValue("engine.tick-frequency").value, 20);
    unsetConfigValue("engine.auto-discover");
    assert.equal(getConfigValue("engine.auto-discover").value, "off");
    unsetConfigValue("engine.tick-frequency");
    assert.equal(getConfigValue("engine.tick-frequency").value, 15);
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
