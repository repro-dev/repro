import assert from "node:assert/strict";
import test from "node:test";

import { runAutobotCli } from "../run";

test("usage errors in json mode still emit a json envelope", () => {
  let stdout = "";
  let stderr = "";

  const exitCode = runAutobotCli(["node", "autobot-next", "--json", "bogus"], {
    stdout: {
      write(chunk: string) {
        stdout += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk: string) {
        stderr += chunk;
        return true;
      },
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(stderr, "");

  const envelope = JSON.parse(stdout);

  assert.equal(envelope.ok, false);
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.command, "--json bogus");
  assert.equal(envelope.error.code, "AUTOBOT-USAGE-ERROR");
  assert.equal("repo" in envelope, false);
});
