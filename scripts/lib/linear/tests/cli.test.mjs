import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeClient() {
  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({
      nodes: [
        { id: "state-backlog", name: "Backlog", type: "backlog" },
        { id: "state-todo", name: "Todo", type: "unstarted" },
      ],
    }),
    labels: async () => ({ nodes: [] }),
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
  };
}

test("top-level help prints command surface", async () => {
  const result = await execute(["--help"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /whoami/);
  assert.match(result.stdout, /linear issue list/);
  assert.match(result.stdout, /statuses backlog and todo/i);
});

test("version output remains available for bootstrap checks", async () => {
  const result = await execute(["--version"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^linear\s+1\.0\.0/m);
});

test("issue list help describes pagination and defaults", async () => {
  const result = await execute(["issue", "list", "--help"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--after <cursor>/);
  assert.match(result.stdout, /backlog.*todo/i);
});

test("whoami shows the viewer and configured team", async () => {
  const result = await execute(["whoami", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.viewer.name, "Test User");
  assert.equal(payload.item.team.key, "REP");
});

test("project list and milestone list are usable", async () => {
  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    projectMilestones: async () => ({
      nodes: [
        {
          id: "ms-1",
          name: "Sprint 1",
          targetDate: null,
          project: Promise.resolve(null),
          updatedAt: new Date("2026-04-18T00:00:00.000Z"),
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({ nodes: [] }),
    labels: async () => ({ nodes: [] }),
    projects: async () => ({ nodes: [project] }),
    issues: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };

  const client = {
    viewer: async () => ({
      id: "viewer-1",
      name: "Test User",
      email: "test@example.com",
    }),
    teams: async () => ({
      nodes: [team],
    }),
    users: async () => ({ nodes: [] }),
    projectMilestones: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabel: async (id) => ({ id, name: id }),
  };

  client.teams = async () => ({
    nodes: [team],
  });

  const projectList = await execute(["project", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });
  assert.equal(projectList.code, 0);
  const projects = JSON.parse(projectList.stdout);
  assert.equal(projects.items[0].name, "Workspace");

  const milestoneList = await execute(
    ["milestone", "list", "--project", "Workspace", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );
  assert.equal(milestoneList.code, 0);
  const milestones = JSON.parse(milestoneList.stdout);
  assert.equal(milestones.items[0].name, "Sprint 1");
});

test("validation rejects invalid priority, invalid limit, and assignee conflicts", async () => {
  const clientFactory = async () => makeClient();

  const badPriority = await execute(
    ["issue", "list", "--priority", "urgent-ish"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(badPriority.code, 2);
  assert.match(badPriority.stderr, /priority/i);

  const badLimit = await execute(["issue", "list", "--limit", "0"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory,
  });
  assert.equal(badLimit.code, 2);
  assert.match(badLimit.stderr, /limit/i);

  const mineAndAssignee = await execute(
    ["issue", "list", "--mine", "--assignee", "test@example.com"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(mineAndAssignee.code, 2);
  assert.match(mineAndAssignee.stderr, /mutually exclusive/i);
});
