import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";
import { makeBoundMethodClient, makeClient } from "./issue-list.test.mjs";

function makeTrackedRelation(records, key, value) {
  return {
    then(resolve) {
      records.resolutions[key] += 1;
      return resolve(value);
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
      "100",
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
  assert.equal(records.issues[0].first, 100);
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

test("issue list paginates large limits with safe page sizes", async () => {
  const records = {
    teams: [],
    states: [],
    issues: [],
  };

  const makeIssue = (index) => ({
    id: `issue-${index}`,
    identifier: `REP-${1000 + index}`,
    title: `Issue ${index}`,
    url: `https://linear.app/acme/issue/REP-${1000 + index}`,
    priority: 3,
    priorityLabel: "Medium",
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    labelIds: [],
    project: Promise.resolve(null),
    projectMilestone: Promise.resolve(null),
    assignee: Promise.resolve(null),
    state: Promise.resolve({
      id: "state-backlog",
      name: "Backlog",
      type: "backlog",
    }),
  });

  const pages = [0, 1, 2].map((page) => ({
    nodes: Array.from({ length: 100 }, (_, index) =>
      makeIssue(page * 100 + index + 1),
    ),
    pageInfo: {
      hasNextPage: true,
      endCursor: `cursor-${page + 1}`,
    },
  }));

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
    issues: async (vars) => {
      records.issues.push(vars);
      if (vars.first > 100) {
        throw new Error(`Unsafe page size: ${vars.first}`);
      }

      const page = pages[records.issues.length - 1];
      return {
        nodes: page.nodes.slice(0, vars.first),
        pageInfo: page.pageInfo,
      };
    },
  };

  const client = {
    teams: async () => ({ nodes: [team] }),
  };

  const result = await execute(["issue", "list", "--limit", "250", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 250);
  assert.equal(payload.pageInfo.hasNextPage, true);
  assert.equal(payload.pageInfo.endCursor, "cursor-3");
  assert.deepEqual(
    records.issues.map(({ after, first }) => ({ after, first })),
    [
      { after: undefined, first: 100 },
      { after: "cursor-1", first: 100 },
      { after: "cursor-2", first: 50 },
    ],
  );
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

test("issue list preserves summary relations without expanding labels", async () => {
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
      return makeTrackedRelation(records, "project", project);
    },
    get projectMilestone() {
      return makeTrackedRelation(records, "milestone", milestone);
    },
    get assignee() {
      return makeTrackedRelation(records, "assignee", {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      });
    },
    get state() {
      return makeTrackedRelation(records, "state", {
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
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items[0].status.name, "Backlog");
  assert.equal(payload.items[0].project.name, "Workspace");
  assert.equal(payload.items[0].milestone.project.name, "Workspace");
  assert.equal(payload.items[0].assignee.name, "Test User");
  assert.deepEqual(records.resolutions, {
    project: 1,
    milestone: 1,
    assignee: 1,
    state: 1,
    milestoneProject: 0,
  });
  assert.equal(records.labels.length, 1);
});

test("issue list can project comments and relations for autobot workflows", async () => {
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
    graphqlRequests: [],
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
      throw new Error("status should not be accessed");
    },
    get labels() {
      throw new Error("labels should not be accessed");
    },
    comments: {
      nodes: [
        {
          id: "comment-1",
          body: "Looks good to me.",
          createdAt: new Date("2026-04-18T01:00:00.000Z"),
          updatedAt: new Date("2026-04-18T01:30:00.000Z"),
          author: {
            id: "user-2",
            name: "Reviewer",
            email: "reviewer@example.com",
          },
          user: {
            id: "user-2",
            name: "Reviewer",
            email: "reviewer@example.com",
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    relations: {
      nodes: [
        {
          id: "relation-blocks-1",
          type: "blocks",
          issue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
          relatedIssue: {
            id: "issue-2",
            identifier: "REP-876",
            title: "Blocked issue",
            url: "https://linear.app/acme/issue/REP-876",
            state: {
              id: "state-todo",
              name: "Todo",
              type: "unstarted",
            },
            assignee: null,
          },
        },
        {
          id: "relation-related-out-1",
          type: "related",
          issue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
          relatedIssue: {
            id: "issue-3",
            identifier: "REP-877",
            title: "Related issue",
            url: "https://linear.app/acme/issue/REP-877",
            state: {
              id: "state-done",
              name: "Done",
              type: "completed",
            },
            assignee: {
              id: "user-3",
              name: "Build User",
              email: "build@example.com",
            },
          },
        },
        {
          id: "relation-duplicate-of-1",
          type: "duplicate",
          issue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
          relatedIssue: {
            id: "issue-4",
            identifier: "REP-878",
            title: "Original issue",
            url: "https://linear.app/acme/issue/REP-878",
            state: {
              id: "state-todo",
              name: "Todo",
              type: "unstarted",
            },
            assignee: null,
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    inverseRelations: {
      nodes: [
        {
          id: "relation-blocked-by-1",
          type: "blocks",
          issue: {
            id: "issue-5",
            identifier: "REP-879",
            title: "Blocking issue",
            url: "https://linear.app/acme/issue/REP-879",
            state: {
              id: "state-todo",
              name: "Todo",
              type: "unstarted",
            },
            assignee: {
              id: "user-4",
              name: "Planner",
              email: "planner@example.com",
            },
          },
          relatedIssue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
        },
        {
          id: "relation-related-in-1",
          type: "related",
          issue: {
            id: "issue-6",
            identifier: "REP-880",
            title: "Related incoming issue",
            url: "https://linear.app/acme/issue/REP-880",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
          relatedIssue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
        },
        {
          id: "relation-duplicate-in-1",
          type: "duplicate",
          issue: {
            id: "issue-7",
            identifier: "REP-881",
            title: "Duplicate issue",
            url: "https://linear.app/acme/issue/REP-881",
            state: {
              id: "state-done",
              name: "Done",
              type: "completed",
            },
            assignee: {
              id: "user-5",
              name: "Closer",
              email: "closer@example.com",
            },
          },
          relatedIssue: {
            id: "issue-1",
            identifier: "REP-875",
            title: "Backlog item",
            url: "https://linear.app/acme/issue/REP-875",
            state: {
              id: "state-backlog",
              name: "Backlog",
              type: "backlog",
            },
            assignee: null,
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
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
          { id: "state-done", name: "Done", type: "completed" },
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
    issues: async () => {
      throw new Error("issues should not be resolved for this projection");
    },
  };

  const result = await execute(
    ["issue", "list", "--json", "comments,relations"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => ({
        client: {
          request: async (query, variables) => {
            records.graphqlRequests.push({ query, variables });
            return {
              team: {
                issues: {
                  nodes: [issue],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            };
          },
        },
        teams: async () => ({ nodes: [team] }),
      }),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload[0].comments.length, 1);
  assert.equal(payload[0].comments[0].body, "Looks good to me.");
  assert.equal(payload[0].relations.blocks.length, 1);
  assert.equal(payload[0].relations.blockedBy.length, 1);
  assert.equal(payload[0].relations.related.length, 2);
  assert.equal(payload[0].relations.duplicateOf.length, 1);
  assert.equal(payload[0].relations.duplicates.length, 1);
  assert.equal(records.graphqlRequests.length, 1);
  assert.match(records.graphqlRequests[0].query, /comments \{/);
  assert.match(records.graphqlRequests[0].query, /relations \{/);
  assert.match(records.graphqlRequests[0].query, /inverseRelations \{/);
  assert.equal(records.issues.length, 0);
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
