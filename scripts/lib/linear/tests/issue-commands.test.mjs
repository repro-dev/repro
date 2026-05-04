import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeTrackedRelation(records, key, value) {
  return {
    then(resolve) {
      records.resolutions[key] += 1;
      return resolve(value);
    },
  };
}

function makeClient(records) {
  records.children ??= [];
  records.updateIssue ??= [];
  records.createComment ??= [];
  records.createIssue ??= [];
  records.issueRelationCreate ??= [];
  records.calls ??= [];
  records.issueLabels ??= new Map([
    ["label-feature", { id: "label-feature", name: "Feature" }],
    ["label-bug", { id: "label-bug", name: "Bug" }],
  ]);

  const states = [
    { id: "state-todo", name: "Todo", type: "unstarted" },
    { id: "state-progress", name: "In Progress", type: "started" },
    { id: "state-review", name: "In Review", type: "started" },
  ];
  const currentLabelIds = records.issueLabelIds ?? [];

  const childIssue = {
    id: "issue-2",
    identifier: "REP-876",
    title: "Child task",
    url: "https://linear.app/acme/issue/REP-876",
    priority: 2,
    priorityLabel: "High",
    updatedAt: new Date("2026-04-18T00:15:00.000Z"),
    description: "",
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-review",
      name: "In Review",
      type: "started",
    }),
  };

  const issue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Parent issue",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "desc",
    parentId: null,
    labelIds: currentLabelIds,
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
    children: async function (vars) {
      records.children.push(vars);
      return {
        nodes: [childIssue],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async function (vars) {
      records.states = [...(records.states ?? []), vars];
      return {
        nodes: states,
      };
    },
    labels: async () => ({
      nodes: [
        { id: "label-feature", name: "Feature" },
        { id: "label-bug", name: "Bug" },
      ],
    }),
    projects: async () => ({
      nodes: [
        {
          id: "project-1",
          name: "Workspace",
          url: "https://linear.app/acme/project/workspace",
          projectMilestones: async () => ({
            nodes: [
              {
                id: "milestone-1",
                name: "Sprint 1",
                targetDate: null,
                updatedAt: new Date("2026-04-18T00:00:00.000Z"),
                project: Promise.resolve(null),
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          }),
        },
      ],
    }),
    issues: async function (vars) {
      records.issues = [...(records.issues ?? []), vars];
      const issueNumber = vars?.filter?.number?.eq;
      const lookupIssue = records.issueLookups?.get(issueNumber) ?? issue;
      return {
        nodes: [lookupIssue],
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
    teams: async function (vars) {
      records.teams = [...(records.teams ?? []), vars];
      return { nodes: [team] };
    },
    users: async () => ({
      nodes: [
        {
          id: "user-1",
          name: "Test User",
          displayName: "Test User",
          email: "test@example.com",
        },
      ],
    }),
    projectMilestones: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabel: async (id) => records.issueLabels.get(id) ?? null,
    createIssue: async function (input) {
      records.createIssue.push(input);
      records.calls.push("createIssue");
      return {
        ...issue,
        identifier: "REP-900",
        title: input.title,
        description: input.description ?? "",
        labelIds: input.labelIds ?? [],
        priority: input.priority ?? 3,
        priorityLabel: "Medium",
        project: Promise.resolve({
          id: input.projectId,
          name: "Workspace",
          url: "https://linear.app/acme/project/workspace",
        }),
        projectMilestone: Promise.resolve(null),
        state: Promise.resolve({
          id: "state-todo",
          name: "Todo",
          type: "unstarted",
        }),
      };
    },
    updateIssue: async function (id, input) {
      records.updateIssue.push({ id, input });
      const nextState =
        states.find(
          (state) => state.id === (input.stateId ?? issue.state?.id),
        ) ?? states[0];
      return {
        ...issue,
        description: input.description ?? issue.description,
        labelIds: input.labelIds ?? issue.labelIds,
        project: input.projectId
          ? Promise.resolve({
              id: input.projectId,
              name: "Workspace",
              url: "https://linear.app/acme/project/workspace",
            })
          : issue.project,
        projectMilestone: input.projectMilestoneId
          ? Promise.resolve({ id: input.projectMilestoneId, name: "Sprint 1" })
          : issue.projectMilestone,
        assignee: input.assigneeId
          ? Promise.resolve({
              id: input.assigneeId,
              name: "Test User",
              email: "test@example.com",
            })
          : issue.assignee,
        state: Promise.resolve(nextState),
        priority: input.priority ?? issue.priority,
        updatedAt: new Date("2026-04-18T02:00:00.000Z"),
      };
    },
    issueRelationCreate: async function (input) {
      records.issueRelationCreate.push(input);
      records.calls.push("issueRelationCreate");
      return {
        issueRelation: {
          id: "relation-1",
          type: input.type,
          issue: Promise.resolve({ id: input.issueId }),
          relatedIssue: Promise.resolve({ id: input.relatedIssueId }),
        },
      };
    },
    createComment: async function (input) {
      records.createComment.push(input);
      return {
        id: "comment-1",
        body: input.body,
        createdAt: new Date("2026-04-18T02:30:00.000Z"),
        updatedAt: new Date("2026-04-18T02:45:00.000Z"),
        issueId: input.issueId,
      };
    },
  };
}

test("issue children returns child issues and pageInfo", async () => {
  const records = {};

  const result = await execute(["issue", "children", "REP-875", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].identifier, "REP-876");
  assert.equal(payload.pageInfo.hasNextPage, false);
  assert.equal(payload.pageInfo.endCursor, null);
  assert.deepEqual(records.children, [{ first: 200 }]);
});

test("issue children preserves summary relations without expanding details", async () => {
  const records = {
    children: [],
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
    resolutions: {
      project: 0,
      milestone: 0,
      assignee: 0,
      state: 0,
      milestoneProject: 0,
    },
  };

  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
  };

  const milestone = {
    id: "milestone-1",
    name: "Sprint 1",
    targetDate: null,
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    get project() {
      return makeTrackedRelation(records, "milestoneProject", project);
    },
  };

  const childIssue = {
    id: "issue-2",
    identifier: "REP-876",
    title: "Child task",
    url: "https://linear.app/acme/issue/REP-876",
    priority: 2,
    priorityLabel: "High",
    updatedAt: new Date("2026-04-18T00:15:00.000Z"),
    description: "",
    parentId: "issue-1",
    labelIds: [],
    get project() {
      return makeTrackedRelation(records, "project", project);
    },
    get projectMilestone() {
      return makeTrackedRelation(records, "milestone", milestone);
    },
    get assignee() {
      return makeTrackedRelation(records, "assignee", null);
    },
    get state() {
      return makeTrackedRelation(records, "state", {
        id: "state-review",
        name: "In Review",
        type: "started",
      });
    },
  };

  const issue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Parent issue",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "desc",
    labelIds: [],
    get project() {
      return makeTrackedRelation(records, "project", null);
    },
    get projectMilestone() {
      return makeTrackedRelation(records, "milestone", null);
    },
    get assignee() {
      return makeTrackedRelation(records, "assignee", null);
    },
    get state() {
      return makeTrackedRelation(records, "state", {
        id: "state-todo",
        name: "Todo",
        type: "unstarted",
      });
    },
    children: async function (vars) {
      records.children.push(vars);
      return {
        nodes: [childIssue],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async function (vars) {
      records.states = [...(records.states ?? []), vars];
      return {
        nodes: [
          { id: "state-todo", name: "Todo", type: "unstarted" },
          { id: "state-review", name: "In Review", type: "started" },
        ],
      };
    },
    labels: async () => ({ nodes: [] }),
    projects: async () => ({ nodes: [] }),
    issues: async function (vars) {
      records.issues = [...(records.issues ?? []), vars];
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
    teams: async function (vars) {
      records.teams = [...(records.teams ?? []), vars];
      return { nodes: [team] };
    },
    users: async () => ({ nodes: [] }),
    projectMilestones: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabel: async () => null,
  };

  const result = await execute(["issue", "children", "REP-875", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items[0].identifier, "REP-876");
  assert.equal(payload.items[0].project.name, "Workspace");
  assert.equal(payload.items[0].milestone.project.name, "Workspace");
  assert.equal(payload.items[0].status.name, "In Review");
  assert.equal(payload.items[0].assignee, null);
  assert.deepEqual(records.resolutions, {
    project: 1,
    milestone: 1,
    assignee: 1,
    state: 1,
    milestoneProject: 0,
  });
});

test("issue update resolves statuses and calls updateIssue", async () => {
  const records = {};

  const result = await execute(
    [
      "issue",
      "update",
      "REP-875",
      "--status",
      "In Review",
      "--description",
      "Updated details",
      "--label",
      "Feature",
      "--label",
      "Bug",
      "--project",
      "Workspace",
      "--milestone",
      "Sprint 1",
      "--priority",
      "high",
      "--assignee",
      "test@example.com",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.identifier, "REP-875");
  assert.equal(payload.item.status.name, "In Review");
  assert.equal(payload.item.description, "Updated details");
  assert.deepEqual(
    payload.item.labels.map((label) => label.name),
    ["Feature", "Bug"],
  );
  assert.equal(records.updateIssue[0].id, "issue-1");
  assert.equal(records.updateIssue[0].input.stateId, "state-review");
  assert.equal(records.updateIssue[0].input.description, "Updated details");
  assert.deepEqual(records.updateIssue[0].input.labelIds, [
    "label-feature",
    "label-bug",
  ]);
  assert.equal(records.updateIssue[0].input.projectId, "project-1");
  assert.equal(records.updateIssue[0].input.projectMilestoneId, "milestone-1");
  assert.equal(records.updateIssue[0].input.priority, 2);
  assert.equal(records.updateIssue[0].input.assigneeId, "user-1");
});

test("issue update forwards title changes to updateIssue", async () => {
  const records = {};

  const result = await execute(
    ["issue", "update", "REP-875", "--title", "Retitled", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  assert.equal(records.updateIssue[0].input.title, "Retitled");
});

test("issue create forwards a parent issue to createIssue", async () => {
  const parentIssue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Parent issue",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "desc",
    parentId: null,
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
  };
  const createdIssue = {
    id: "issue-900",
    identifier: "REP-900",
    title: "Child task",
    url: "https://linear.app/acme/issue/REP-900",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:15:00.000Z"),
    description: "",
    parentId: "issue-1",
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
    parent: Promise.resolve(parentIssue),
  };
  const records = {
    issueLookups: new Map([
      [875, parentIssue],
      [900, createdIssue],
    ]),
  };

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
      clientFactory: async () => {
        const client = makeClient(records);
        client.createIssue = async function (input) {
          records.createIssue.push(input);
          return {
            issue: createdIssue,
            issueId: createdIssue.id,
          };
        };
        return client;
      },
    },
  );

  assert.equal(result.code, 0);
  assert.equal(records.createIssue[0].parentId, "issue-1");
  assert.deepEqual(records.issues, [
    { filter: { number: { eq: 875 } }, first: 1 },
    { filter: { number: { eq: 900 } }, first: 1 },
  ]);
});

test("issue update can reparent and remove a parent relationship", async () => {
  const parentIssue = {
    id: "issue-1",
    identifier: "REP-875",
    title: "Parent issue",
    url: "https://linear.app/acme/issue/REP-875",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    description: "desc",
    parentId: null,
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
  };
  const reparentedIssue = {
    id: "issue-2",
    identifier: "REP-876",
    title: "Child task",
    url: "https://linear.app/acme/issue/REP-876",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:15:00.000Z"),
    description: "",
    parentId: "issue-1",
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
    parent: Promise.resolve(parentIssue),
  };
  const assignRecords = {
    issueLookups: new Map([
      [875, parentIssue],
      [876, reparentedIssue],
    ]),
  };

  const assignResult = await execute(
    ["issue", "update", "REP-876", "--parent", "REP-875", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => {
        const client = makeClient(assignRecords);
        client.updateIssue = async function (id, input) {
          assignRecords.updateIssue.push({ id, input });
          return {
            issue: {
              ...reparentedIssue,
              parentId: input.parentId,
              parent: Promise.resolve(parentIssue),
            },
            issueId: reparentedIssue.id,
          };
        };
        return client;
      },
    },
  );

  assert.equal(assignResult.code, 0);
  assert.equal(assignRecords.updateIssue[0].input.parentId, "issue-1");
  const assignPayload = JSON.parse(assignResult.stdout);
  assert.equal(assignPayload.item.identifier, "REP-876");
  assert.equal(assignPayload.item.parent.identifier, "REP-875");
  assert.deepEqual(assignRecords.issues, [
    { filter: { number: { eq: 876 } }, first: 1 },
    { filter: { number: { eq: 875 } }, first: 1 },
    { filter: { number: { eq: 876 } }, first: 1 },
  ]);

  const removeIssue = {
    id: "issue-2",
    identifier: "REP-876",
    title: "Child task",
    url: "https://linear.app/acme/issue/REP-876",
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:15:00.000Z"),
    description: "",
    parentId: null,
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
    }),
    parent: Promise.resolve(null),
  };
  const removeRecords = {
    issueLookups: new Map([[876, removeIssue]]),
  };
  const removeResult = await execute(
    ["issue", "update", "REP-876", "--remove-parent", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => {
        const client = makeClient(removeRecords);
        client.updateIssue = async function (id, input) {
          removeRecords.updateIssue = [
            ...(removeRecords.updateIssue ?? []),
            { id, input },
          ];
          return {
            issue: {
              ...removeIssue,
              parentId: input.parentId,
              parent: Promise.resolve(null),
            },
            issueId: removeIssue.id,
          };
        };
        return client;
      },
    },
  );

  assert.equal(removeResult.code, 0);
  const removePayload = JSON.parse(removeResult.stdout);
  assert.equal(removePayload.item.identifier, "REP-876");
  assert.equal(removeRecords.updateIssue[0].input.parentId, null);
});

test("issue update rejects conflicting parent set and remove flags", async () => {
  const result = await execute(
    ["issue", "update", "REP-876", "--parent", "REP-875", "--remove-parent"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient({}),
    },
  );

  assert.equal(result.code, 2);
  assert.match(result.stderr, /cannot be combined/i);
});

test("issue update human output keeps the original identifier when updateIssue is sparse", async () => {
  const records = {};
  const client = makeClient(records);

  client.updateIssue = async function (id, input) {
    records.updateIssue.push({ id, input });
    return {
      id: "issue-1",
      title: "Parent issue",
      url: "https://linear.app/acme/issue/REP-875",
      priority: 3,
      priorityLabel: "Medium",
      updatedAt: new Date("2026-04-18T02:00:00.000Z"),
      description: "desc",
      labelIds: [],
      project: Promise.resolve(null),
      projectMilestone: Promise.resolve(null),
      assignee: Promise.resolve(null),
      state: Promise.resolve({
        id: "state-review",
        name: "In Review",
        type: "started",
      }),
    };
  };

  const result = await execute(
    ["issue", "update", "REP-875", "--status", "In Review"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "REP-875 updated\n");
});

test("issue update merges add/remove label flags against current labels", async () => {
  const records = { issueLabelIds: ["label-feature"] };

  const result = await execute(
    [
      "issue",
      "update",
      "REP-875",
      "--add-label",
      "Bug",
      "--remove-label",
      "Feature",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.item.labels.map((label) => label.name),
    ["Bug"],
  );
  assert.deepEqual(records.updateIssue[0].input.labelIds, ["label-bug"]);
});

test("issue update replaces labels exactly when --label is used", async () => {
  const records = { issueLabelIds: ["label-feature"] };

  const result = await execute(
    ["issue", "update", "REP-875", "--label", "Bug", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.item.labels.map((label) => label.name),
    ["Bug"],
  );
  assert.deepEqual(records.updateIssue[0].input.labelIds, ["label-bug"]);
});

test("issue update rejects replace labels together with add/remove flags", async () => {
  const result = await execute(
    ["issue", "update", "REP-875", "--label", "Feature", "--add-label", "Bug"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient({}),
    },
  );

  assert.equal(result.code, 2);
  assert.match(result.stderr, /cannot be combined/i);
});

test("issue update supports --mine and rejects conflicting assignee flags", async () => {
  const mineResult = await execute(
    ["issue", "update", "REP-875", "--mine", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient({}),
    },
  );

  assert.equal(mineResult.code, 0);
  const minePayload = JSON.parse(mineResult.stdout);
  assert.equal(minePayload.item.assignee.name, "Test User");

  const conflictResult = await execute(
    ["issue", "update", "REP-875", "--mine", "--assignee", "test@example.com"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient({}),
    },
  );

  assert.equal(conflictResult.code, 2);
  assert.match(conflictResult.stderr, /cannot be combined/i);
});

test("issue start assigns the issue to self and moves it to In Progress", async () => {
  const records = {};

  const result = await execute(["issue", "start", "REP-875", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(records),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.status.name, "In Progress");
  assert.equal(payload.item.assignee.name, "Test User");
  assert.equal(records.updateIssue[0].input.stateId, "state-progress");
  assert.equal(records.updateIssue[0].input.assigneeId, "viewer-1");
});

test("issue create resolves project, labels, and priority", async () => {
  const records = {};

  const result = await execute(
    [
      "issue",
      "create",
      "--title",
      "Ship it",
      "--project",
      "Workspace",
      "--description",
      "Details",
      "--label",
      "Feature",
      "--priority",
      "high",
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
  assert.equal(payload.item.description, "Details");
  assert.deepEqual(
    payload.item.labels.map((label) => label.name),
    ["Feature"],
  );
  assert.equal(records.createIssue[0].teamId, "team-1");
  assert.equal(records.createIssue[0].title, "Ship it");
  assert.equal(records.createIssue[0].projectId, "project-1");
  assert.deepEqual(records.createIssue[0].labelIds, ["label-feature"]);
  assert.equal(records.createIssue[0].priority, 2);
});

test("issue create creates relations after the issue is created", async () => {
  const records = {
    issueLookups: new Map([
      [876, { id: "issue-2", identifier: "REP-876", title: "Related" }],
      [877, { id: "issue-3", identifier: "REP-877", title: "Blocks" }],
      [878, { id: "issue-4", identifier: "REP-878", title: "Blocked by" }],
      [879, { id: "issue-5", identifier: "REP-879", title: "Duplicate of" }],
    ]),
  };

  const result = await execute(
    [
      "issue",
      "create",
      "--title",
      "Ship it",
      "--project",
      "Workspace",
      "--related",
      "REP-876",
      "--blocks",
      "REP-877",
      "--blocked-by",
      "REP-878",
      "--duplicate-of",
      "REP-879",
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
  assert.deepEqual(records.calls, [
    "createIssue",
    "issueRelationCreate",
    "issueRelationCreate",
    "issueRelationCreate",
    "issueRelationCreate",
  ]);
  assert.deepEqual(records.issueRelationCreate, [
    {
      issueId: "issue-1",
      relatedIssueId: "issue-2",
      type: "related",
    },
    {
      issueId: "issue-1",
      relatedIssueId: "issue-3",
      type: "blocks",
    },
    {
      issueId: "issue-4",
      relatedIssueId: "issue-1",
      type: "blocks",
    },
    {
      issueId: "issue-1",
      relatedIssueId: "issue-5",
      type: "duplicate",
    },
  ]);
  assert.equal(records.teams.length, 1);
});

test("issue create validates required title and project", async () => {
  const clientFactory = async () => makeClient({});

  const missingTitle = await execute(
    ["issue", "create", "--project", "Workspace"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(missingTitle.code, 2);
  assert.match(missingTitle.stderr, /title/i);

  const missingProject = await execute(
    ["issue", "create", "--title", "Ship it"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(missingProject.code, 2);
  assert.match(missingProject.stderr, /project/i);
});

test("issue update reports unknown status names clearly", async () => {
  const records = {};

  const result = await execute(
    ["issue", "update", "REP-875", "--status", "Not a state"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown status/i);
});

test("issue comment creates a comment and returns the created item", async () => {
  const records = {};

  const result = await execute(
    ["issue", "comment", "REP-875", "please", "investigate", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.id, "comment-1");
  assert.equal(payload.item.body, "please investigate");
  assert.equal(payload.item.issueId, "issue-1");
  assert.equal(records.createComment[0].issueId, "issue-1");
  assert.equal(records.createComment[0].body, "please investigate");
});
