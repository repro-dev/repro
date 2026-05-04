import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function priorityLabel(priority) {
  return (
    ["None", "Urgent", "High", "Medium", "Low"][priority] ?? String(priority)
  );
}

function makeIssueRecord(number, { title, parent = null } = {}) {
  const identifier = `REP-${number}`;
  const issue = {
    id: `issue-${number}`,
    identifier,
    title: title ?? `Issue ${number}`,
    url: `https://linear.app/acme/issue/${identifier}`,
    priority: 3,
    priorityLabel: priorityLabel(3),
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "",
    parentId: parent?.id ?? null,
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
    parent: Promise.resolve(parent),
  };

  return issue;
}

function makeSparseMutationIssue(number, input, parentId) {
  return {
    id: `issue-${number}`,
    identifier: `REP-${number}`,
    title: input.title,
    url: `https://linear.app/acme/issue/REP-${number}`,
    priority: input.priority ?? 3,
    priorityLabel: priorityLabel(input.priority ?? 3),
    updatedAt: new Date("2026-04-18T02:00:00.000Z"),
    description: input.description ?? "",
    labelIds: input.labelIds ?? [],
    parentId: parentId ?? null,
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
  };
}

function seedIssueMaps(records, issues) {
  records.issueByNumber = new Map();
  records.issueById = new Map();

  for (const [number, issue] of issues) {
    records.issueByNumber.set(number, issue);
    records.issueById.set(issue.id, issue);
  }
}

function makeClient(records) {
  records.createIssue ??= [];
  records.updateIssue ??= [];
  records.issues ??= [];

  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({
      nodes: [
        { id: "state-todo", name: "Todo", type: "unstarted" },
        { id: "state-progress", name: "In Progress", type: "started" },
      ],
    }),
    labels: async () => ({ nodes: [] }),
    projects: async () => ({ nodes: [project] }),
    issues: async function (vars) {
      records.issues.push(vars);
      const number = vars?.filter?.number?.eq;
      const issue = records.issueByNumber.get(number);
      return {
        nodes: issue ? [issue] : [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
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
    issueLabel: async () => null,
    createIssue: async function (input) {
      records.createIssue.push(input);
      const parentIssue = input.parentId
        ? records.issueById.get(input.parentId) ?? null
        : null;
      const persistedParentId = records.createPersistedParentId
        ? input.parentId ?? null
        : null;
      const createdIssue = makeSparseMutationIssue(900, input, input.parentId);

      records.issueByNumber.set(
        900,
        makeIssueRecord(900, {
          title: input.title,
          parent: persistedParentId ? parentIssue : null,
        }),
      );
      records.issueById.set("issue-900", records.issueByNumber.get(900));

      return createdIssue;
    },
    updateIssue: async function (id, input) {
      records.updateIssue.push({ id, input });
      const issueNumber = 876;
      const parentIssue = input.parentId
        ? records.issueById.get(input.parentId) ?? null
        : null;
      const persistedParentId = records.updatePersistedParentId
        ? input.parentId ?? null
        : null;

      records.issueByNumber.set(
        issueNumber,
        makeIssueRecord(issueNumber, {
          title: "Child task",
          parent: persistedParentId ? parentIssue : null,
        }),
      );
      records.issueById.set(
        `issue-${issueNumber}`,
        records.issueByNumber.get(issueNumber),
      );

      return makeSparseMutationIssue(issueNumber, input, input.parentId);
    },
  };
}

test("issue create verifies parent persistence before reporting success", async () => {
  const parentIssue = makeIssueRecord(875, { title: "Parent issue" });
  const records = {
    createPersistedParentId: true,
  };
  seedIssueMaps(records, [[875, parentIssue]]);

  const result = await execute(
    [
      "issue",
      "create",
      "--title",
      "Child task",
      "--project",
      "Workspace",
      "--parent",
      "REP-875",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-900");
  assert.equal(payload.item.parentId, parentIssue.id);
  assert.equal(payload.item.parent.identifier, "REP-875");
  assert.deepEqual(records.createIssue[0].parentId, parentIssue.id);
  assert.deepEqual(
    records.issues.map((entry) => entry.filter.number.eq),
    [875, 900],
  );
});

test("issue create fails when the persisted parent does not match", async () => {
  const parentIssue = makeIssueRecord(875, { title: "Parent issue" });
  const records = {
    createPersistedParentId: false,
  };
  seedIssueMaps(records, [[875, parentIssue]]);

  const result = await execute(
    [
      "issue",
      "create",
      "--title",
      "Child task",
      "--project",
      "Workspace",
      "--parent",
      "REP-875",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Parent mutation did not persist/i);
  assert.match(result.stderr, /linear issue show REP-900 --json/i);
  assert.deepEqual(records.createIssue[0].parentId, parentIssue.id);
  assert.deepEqual(
    records.issues.map((entry) => entry.filter.number.eq),
    [875, 900],
  );
});

test("issue update verifies parent persistence before reporting success", async () => {
  const parentIssue = makeIssueRecord(875, { title: "Parent issue" });
  const childIssue = makeIssueRecord(876, { title: "Child task" });
  const records = {
    updatePersistedParentId: true,
  };
  seedIssueMaps(records, [
    [875, parentIssue],
    [876, childIssue],
  ]);

  const result = await execute(
    ["issue", "update", "REP-876", "--parent", "REP-875", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-876");
  assert.equal(payload.item.parentId, parentIssue.id);
  assert.equal(payload.item.parent.identifier, "REP-875");
  assert.equal(records.updateIssue[0].input.parentId, parentIssue.id);
  assert.deepEqual(
    records.issues.map((entry) => entry.filter.number.eq),
    [876, 875, 876],
  );
});

test("issue update fails when the persisted parent does not match", async () => {
  const parentIssue = makeIssueRecord(875, { title: "Parent issue" });
  const childIssue = makeIssueRecord(876, { title: "Child task" });
  const records = {
    updatePersistedParentId: false,
  };
  seedIssueMaps(records, [
    [875, parentIssue],
    [876, childIssue],
  ]);

  const result = await execute(
    ["issue", "update", "REP-876", "--parent", "REP-875", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Parent mutation did not persist/i);
  assert.match(result.stderr, /linear issue show REP-876 --json/i);
  assert.deepEqual(records.updateIssue[0].input.parentId, parentIssue.id);
  assert.deepEqual(
    records.issues.map((entry) => entry.filter.number.eq),
    [876, 875, 876],
  );
});

test("issue update verifies parent removal before reporting success", async () => {
  const childIssue = makeIssueRecord(876, { title: "Child task" });
  const records = {
    updatePersistedParentId: true,
  };
  seedIssueMaps(records, [[876, childIssue]]);

  const result = await execute(
    ["issue", "update", "REP-876", "--remove-parent", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-876");
  assert.equal(payload.item.parentId, null);
  assert.equal(payload.item.parent, null);
  assert.equal(records.updateIssue[0].input.parentId, null);
  assert.deepEqual(
    records.issues.map((entry) => entry.filter.number.eq),
    [876, 876],
  );
});
