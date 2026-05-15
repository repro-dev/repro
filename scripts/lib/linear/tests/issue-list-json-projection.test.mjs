import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeIssueListClient(records, issue, teamOverrides = {}) {
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
    labels: async () => {
      throw new Error("labels should not be resolved for this projection");
    },
    projects: async () => {
      throw new Error("projects should not be resolved for this projection");
    },
    projectMilestones: async () => {
      throw new Error("milestones should not be resolved for this projection");
    },
    issues: async (vars) => {
      records.issues.push(vars);
      return {
        nodes: [issue],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    ...teamOverrides,
  };

  return {
    teams: async () => ({ nodes: [team] }),
  };
}

test("issue list json projection only resolves requested scalar fields", async () => {
  const records = {
    states: [],
    issues: [],
  };

  const issue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Backlog item",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    get project() {
      throw new Error("project should not be accessed");
    },
    get projectMilestone() {
      throw new Error("milestone should not be accessed");
    },
    get assignee() {
      throw new Error("assignee should not be accessed");
    },
    get state() {
      throw new Error("state should not be accessed");
    },
    get labelIds() {
      throw new Error("labels should not be accessed");
    },
    get description() {
      throw new Error("description should not be accessed");
    },
    get comments() {
      throw new Error("comments should not be accessed");
    },
    get relations() {
      throw new Error("relations should not be accessed");
    },
    get inverseRelations() {
      throw new Error("inverse relations should not be accessed");
    },
  };

  const result = await execute(
    ["issue", "list", "--json", "id,identifier,title,priority"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeIssueListClient(records, issue),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      id: "issue-1",
      identifier: "REP-875",
      title: "Backlog item",
      priority: 3,
    },
  ]);
});

test("issue list json projection still resolves requested relation fields", async () => {
  const records = {
    states: [],
    issues: [],
    labels: [],
    resolutions: {
      project: 0,
      assignee: 0,
      state: 0,
    },
  };

  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
  };

  const issue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Backlog item",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    labelIds: ["label-1"],
    get project() {
      records.resolutions.project += 1;
      return Promise.resolve(project);
    },
    get assignee() {
      records.resolutions.assignee += 1;
      return Promise.resolve({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
    },
    get state() {
      records.resolutions.state += 1;
      return Promise.resolve({
        id: "state-backlog",
        name: "Backlog",
        type: "backlog",
      });
    },
    get projectMilestone() {
      throw new Error("milestone should not be accessed");
    },
    get description() {
      throw new Error("description should not be accessed");
    },
    get comments() {
      throw new Error("comments should not be accessed");
    },
    get relations() {
      throw new Error("relations should not be accessed");
    },
    get inverseRelations() {
      throw new Error("inverse relations should not be accessed");
    },
  };

  const result = await execute(
    [
      "issue",
      "list",
      "--json",
      "identifier,title,url,priority,priorityLabel,status,project,assignee,labels",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () =>
        makeIssueListClient(records, issue, {
          labels: async (vars) => {
            records.labels.push(vars);
            return { nodes: [{ id: "label-1", name: "Feature" }] };
          },
          projects: async () => {
            throw new Error(
              "projects should not be resolved for this projection",
            );
          },
          projectMilestones: async () => {
            throw new Error(
              "milestones should not be resolved for this projection",
            );
          },
        }),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      identifier: "REP-875",
      title: "Backlog item",
      url: "https://linear.app/acme/issue/REP-875",
      priority: 3,
      priorityLabel: "Medium",
      status: {
        id: "state-backlog",
        name: "Backlog",
        type: "backlog",
      },
      project: {
        id: "project-1",
        key: null,
        name: "Workspace",
        url: "https://linear.app/acme/project/workspace",
        updatedAt: null,
      },
      assignee: {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      },
      labels: [{ id: "label-1", name: "Feature" }],
    },
  ]);
  assert.deepEqual(records.resolutions, {
    project: 1,
    assignee: 1,
    state: 1,
  });
  assert.equal(records.labels.length, 1);
});
