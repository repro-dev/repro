import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeIssue({ identifier, id, title, description, parent = null }) {
  return {
    id,
    identifier,
    title,
    url: `https://linear.app/acme/issue/${identifier}`,
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description,
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
}

function makePayload(issue) {
  return { issue, issueId: issue.id };
}

function makeProject() {
  return {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    projectMilestones: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };
}

function makeCreateClient(records) {
  records.issues ??= [];
  records.createIssue ??= [];

  const parentIssue = makeIssue({
    identifier: "REP-875",
    id: "issue-1",
    title: "Parent issue",
    description: "desc",
  });
  const createdIssue = makeIssue({
    identifier: "REP-900",
    id: "issue-9",
    title: "Child task",
    description: "",
    parent: parentIssue,
  });
  const staleCreatedIssue = makeIssue({
    identifier: "REP-900",
    id: "issue-9",
    title: "Child task",
    description: "",
  });

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    projects: async () => ({ nodes: [makeProject()] }),
    issues: async function (vars) {
      records.issues.push(vars);
      const lookup =
        vars.filter.number.eq === 875 ? parentIssue : staleCreatedIssue;
      return {
        nodes: [lookup],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  return {
    client: {
      teams: async () => ({ nodes: [team] }),
      createIssue: async function (input) {
        records.createIssue.push(input);
        return makePayload(createdIssue);
      },
    },
    parentIssue,
  };
}

function makeUpdateClient(records) {
  records.issues ??= [];
  records.updateIssue ??= [];

  const parentIssue = makeIssue({
    identifier: "REP-875",
    id: "issue-1",
    title: "Parent issue",
    description: "desc",
  });
  const updatedIssue = makeIssue({
    identifier: "REP-876",
    id: "issue-2",
    title: "Child task",
    description: "",
    parent: parentIssue,
  });
  const staleUpdatedIssue = makeIssue({
    identifier: "REP-876",
    id: "issue-2",
    title: "Child task",
    description: "",
  });

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    issues: async function (vars) {
      records.issues.push(vars);
      const lookup =
        vars.filter.number.eq === 875 ? parentIssue : staleUpdatedIssue;
      return {
        nodes: [lookup],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  return {
    client: {
      teams: async () => ({ nodes: [team] }),
      updateIssue: async function (id, input) {
        records.updateIssue.push({ id, input });
        return makePayload(updatedIssue);
      },
    },
  };
}

test("issue create with parent fails when readback does not persist the parent", async () => {
  const records = {};
  const { client } = makeCreateClient(records);

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
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Parent mutation did not persist for REP-900/i);
  assert.deepEqual(records.createIssue[0].parentId, "issue-1");
  assert.deepEqual(records.issues, [
    { filter: { number: { eq: 875 } }, first: 1 },
    { filter: { number: { eq: 900 } }, first: 1 },
  ]);
});

test("issue update with parent fails when readback does not persist the parent", async () => {
  const records = {};
  const { client } = makeUpdateClient(records);

  const result = await execute(
    ["issue", "update", "REP-876", "--parent", "REP-875", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Parent mutation did not persist for REP-876/i);
  assert.deepEqual(records.updateIssue[0].input.parentId, "issue-1");
  assert.deepEqual(records.issues, [
    { filter: { number: { eq: 876 } }, first: 1 },
    { filter: { number: { eq: 875 } }, first: 1 },
    { filter: { number: { eq: 876 } }, first: 1 },
  ]);
});
