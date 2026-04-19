import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeClient(records) {
  records.createLabel ??= [];

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({ nodes: [] }),
    labels: async () => ({
      nodes: [
        { id: "label-1", name: "Feature", description: "Feature work" },
        { id: "label-2", name: "Bug", description: "Bug fix" },
      ],
    }),
    projects: async () => ({ nodes: [] }),
    issues: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };

  return {
    viewer: async () => ({
      id: "viewer-1",
      name: "Test User",
      email: "test@example.com",
    }),
    teams: async () => ({ nodes: [team] }),
    users: async () => ({ nodes: [] }),
    projectMilestones: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabel: async (id) => ({ id, name: id }),
    createIssueLabel: async function (input) {
      records.createLabel.push(input);
      return {
        id: "label-3",
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
      };
    },
  };
}

test("label list returns the visible team labels", async () => {
  const records = {};

  const result = await execute(["label", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].name, "Feature");
});

test("label create forwards name, description, and color", async () => {
  const records = {};

  const result = await execute(
    [
      "label",
      "create",
      "--name",
      "Needs Triage",
      "--description",
      "Triage later",
      "--color",
      "#ff00ff",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.name, "Needs Triage");
  assert.equal(records.createLabel[0].teamId, "team-1");
  assert.equal(records.createLabel[0].name, "Needs Triage");
  assert.equal(records.createLabel[0].description, "Triage later");
  assert.equal(records.createLabel[0].color, "#ff00ff");
});

test("label create validates --name", async () => {
  const result = await execute(["label", "create", "--description", "oops"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient({}),
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /name/i);
});
