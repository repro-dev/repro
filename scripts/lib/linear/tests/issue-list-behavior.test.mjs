import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";
import { makeBoundMethodClient, makeClient } from "./issue-list.test.mjs";

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
    comments: [],
    relations: [],
    inverseRelations: [],
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
      "--limit",
      "250",
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
  assert.equal(records.issues[0].first, 250);
  assert.ok(records.issues[0].filter.and);
  assert.equal(records.issues[0].filter.and[0].project.id.eq, "project-1");
  assert.deepEqual(records.issues[0].filter.and[1].state.id.in, [
    "state-backlog",
    "state-todo",
  ]);
  assert.equal(records.viewerCalls.length, 0);
  assert.equal(records.labels.length, 1);
  assert.deepEqual(records.issueLabels, []);
});

test("issue list forwards leaf and unblocked filters together", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
  };

  const result = await execute(
    [
      "issue",
      "list",
      "--project",
      "Workspace",
      "--status",
      "todo",
      "--unblocked",
      "--leaf",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  assert.equal(records.issues.length, 1);
  assert.deepEqual(records.issues[0].filter.and[0].project.id.eq, "project-1");
  assert.deepEqual(records.issues[0].filter.and[1].state.id.in, ["state-todo"]);
  assert.deepEqual(
    records.issues[0].filter.and[2].hasBlockedByRelations.eq,
    false,
  );
  assert.deepEqual(records.issues[0].filter.and[3].children.length.eq, 0);
});

test("issue list keeps SDK-style methods bound when invoking queries", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
  };

  const result = await execute(["issue", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeBoundMethodClient(records),
  });

  assert.equal(result.code, 0);
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
    comments: [],
    relations: [],
    inverseRelations: [],
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
  assert.equal(records.viewerCalls.length, 0);
  assert.equal(records.labels.length, 1);
  assert.deepEqual(records.issueLabels, []);
});

test("issue list does not hydrate issue relations per row", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
    accesses: {
      project: 0,
      milestone: 0,
      assignee: 0,
      state: 0,
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
    get project() {
      records.accesses.project += 1;
      return Promise.resolve({
        id: "project-1",
        name: "Workspace",
        url: "https://linear.app/acme/project/workspace",
      });
    },
    get projectMilestone() {
      records.accesses.milestone += 1;
      return Promise.resolve({
        id: "milestone-1",
        name: "Sprint 1",
      });
    },
    get assignee() {
      records.accesses.assignee += 1;
      return Promise.resolve({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
    },
    get state() {
      records.accesses.state += 1;
      return Promise.resolve({
        id: "state-backlog",
        name: "Backlog",
        type: "backlog",
      });
    },
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
        ],
      };
    },
    labels: async (vars) => {
      records.labels.push(vars);
      return { nodes: [{ id: "label-1", name: "Feature" }] };
    },
    projects: async (vars) => {
      records.projects.push(vars);
      return { nodes: [] };
    },
    issues: async (vars) => {
      records.issues.push(vars);
      return {
        nodes: [issue],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  const client = {
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
      return { nodes: [] };
    },
    projectMilestones: async (vars) => {
      records.projectMilestones.push(vars);
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },
    issueLabel: async (id) => {
      records.issueLabels.push(id);
      return { id, name: "Feature" };
    },
  };

  const result = await execute(["issue", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });

  assert.equal(result.code, 0);
  for (const [field, count] of Object.entries(records.accesses)) {
    assert.equal(count, 0, field);
  }
});

test("issue show returns the shared serializer plus description, comments, and relations", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
  };

  const result = await execute(["issue", "show", "REP-875", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-875");
  assert.equal(payload.item.description, "desc");
  assert.equal(payload.item.milestone.name, "Sprint 1");
  assert.deepEqual(payload.item.milestone.project, {
    id: "project-1",
    key: null,
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    updatedAt: null,
  });
  assert.equal(payload.item.comments.length, 1);
  assert.equal(payload.item.comments[0].body, "Looks good to me.");
  assert.equal(payload.item.comments[0].author.name, "Reviewer");
  assert.equal(payload.item.relations.blocks.length, 1);
  assert.equal(payload.item.relations.blocks[0].identifier, "REP-876");
  assert.equal(payload.item.relations.blockedBy.length, 1);
  assert.equal(payload.item.relations.blockedBy[0].identifier, "REP-879");
  assert.equal(payload.item.relations.related.length, 2);
  assert.deepEqual(
    payload.item.relations.related.map((entry) => entry.identifier),
    ["REP-877", "REP-880"],
  );
  assert.equal(payload.item.relations.duplicateOf.length, 1);
  assert.equal(payload.item.relations.duplicateOf[0].identifier, "REP-878");
  assert.equal(payload.item.relations.duplicates.length, 1);
  assert.equal(payload.item.relations.duplicates[0].identifier, "REP-881");
  assert.equal(records.labels.length, 1);
  assert.deepEqual(records.issueLabels, []);
  assert.equal(records.relationIssueAccesses.length, 6);
  assert.equal(records.relationRelatedIssueAccesses.length, 6);
  assert.deepEqual(records.comments, [{ first: 50 }]);
  assert.deepEqual(records.relations, [{ first: 50 }]);
  assert.deepEqual(records.inverseRelations, [{ first: 50 }]);
});

test("issue show human output includes blockers and comments", async () => {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
  };

  const result = await execute(["issue", "show", "REP-875"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Blocks:/);
  assert.match(result.stdout, /Blocked by:/);
  assert.match(result.stdout, /Related:/);
  assert.match(result.stdout, /Comments:/);
  assert.match(result.stdout, /Looks good to me\./);
});
