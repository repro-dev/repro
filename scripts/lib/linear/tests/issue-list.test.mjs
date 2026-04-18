import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeClient(records) {
  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    projectMilestones: async (vars) => {
      records.projectMilestones.push(vars);
      return {
        nodes: [
          {
            id: "milestone-1",
            name: "Sprint 1",
            targetDate: null,
            updatedAt: new Date("2026-04-18T00:00:00.000Z"),
            project: Promise.resolve(project),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  const issue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Backlog item",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "desc",
    labelIds: ["label-1"],
    project: Promise.resolve(project),
    projectMilestone: Promise.resolve({ id: "milestone-1", name: "Sprint 1" }),
    assignee: Promise.resolve({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
    }),
    state: Promise.resolve({
      id: "state-backlog",
      name: "Backlog",
      type: "backlog",
    }),
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async (vars) => {
      records.states.push(vars);
      return {
        nodes: [
          { id: "state-backlog", name: "Backlog", type: "backlog" },
          { id: "state-todo", name: "Todo", type: "unstarted" },
          { id: "state-done", name: "Done", type: "completed" },
        ],
      };
    },
    labels: async (vars) => {
      records.labels.push(vars);
      return {
        nodes: [{ id: "label-1", name: "Feature" }],
      };
    },
    projects: async (vars) => {
      records.projects.push(vars);
      return { nodes: [project] };
    },
    issues: async (vars) => {
      records.issues.push(vars);
      return {
        nodes: [issue],
        pageInfo: { hasNextPage: true, endCursor: "abc123" },
      };
    },
  };

  return {
    viewer: async () => ({
      id: "viewer-1",
      name: "Test User",
      email: "test@example.com",
    }),
    teams: async (vars) => {
      records.teams.push(vars);
      return { nodes: [team] };
    },
    users: async (vars) => {
      records.users.push(vars);
      return {
        nodes: [
          {
            id: "user-1",
            name: "Test User",
            displayName: "Test User",
            email: "test@example.com",
          },
        ],
      };
    },
    projectMilestones: async (vars) => {
      records.projectMilestones.push(vars);
      return {
        nodes: [
          {
            id: "milestone-1",
            name: "Sprint 1",
            targetDate: null,
            updatedAt: new Date("2026-04-18T00:00:00.000Z"),
            project: Promise.resolve(project),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    issueLabel: async (id) => {
      records.issueLabels.push(id);
      return { id, name: "Feature" };
    },
  };
}

test("issue list constructs server-side filters and forwards pagination", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
  };

  const result = await execute(
    [
      "issue",
      "list",
      "--project",
      "Workspace",
      "--status",
      "backlog",
      "--status",
      "todo",
      "--after",
      "cursor-1",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.pageInfo.hasNextPage, true);
  assert.equal(payload.pageInfo.endCursor, "abc123");
  assert.equal(records.issues.length, 1);
  assert.equal(records.issues[0].after, "cursor-1");
  assert.equal(records.issues[0].first, 50);
  assert.ok(records.issues[0].filter.and);
  assert.equal(records.issues[0].filter.and[0].project.id.eq, "project-1");
  assert.deepEqual(records.issues[0].filter.and[1].state.id.in, [
    "state-backlog",
    "state-todo",
  ]);
});

test("issue list defaults to backlog and todo when no filters are supplied", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
  };

  await execute(["issue", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(records.issues.length, 1);
  assert.deepEqual(records.issues[0].filter.state.id.in, [
    "state-backlog",
    "state-todo",
  ]);
});

test("issue show returns the shared serializer plus description", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
  };

  const result = await execute(["issue", "show", "REP-875", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-875");
  assert.equal(payload.item.description, "desc");
  assert.deepEqual(records.issueLabels, ["label-1"]);
});
