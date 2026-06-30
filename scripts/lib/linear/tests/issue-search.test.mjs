import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

function makeIssue(index, overrides = {}) {
  return {
    id: overrides.id ?? `search-issue-${index}`,
    identifier: overrides.identifier ?? `REP-${2000 + index}`,
    title: overrides.title ?? `Search result ${index}`,
    url:
      overrides.url ??
      `https://linear.app/acme/issue/REP-${2000 + index}`,
    priority: overrides.priority ?? 2,
    priorityLabel: overrides.priorityLabel ?? "High",
    updatedAt: overrides.updatedAt ?? new Date("2026-04-20T00:00:00.000Z"),
    description: overrides.description ?? null,
    labelIds: overrides.labelIds ?? [],
    project: overrides.project ?? null,
    projectMilestone: overrides.projectMilestone ?? null,
    assignee: overrides.assignee ?? null,
    state: overrides.state ?? {
      id: "state-backlog",
      name: "Backlog",
      type: "backlog",
    },
    labels: overrides.labels ?? { nodes: [] },
  };
}

function makeSearchResponse(issues) {
  const nodes = issues ?? [];
  return {
    searchIssues: {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: nodes.length,
    },
  };
}

function makeSearchClient(searchResponse) {
  const records = {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    graphqlRequests: [],
    viewerCalls: [],
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
      return { nodes: [{ id: "label-1", name: "Feature" }] };
    },
    projects: async (vars) => {
      records.projects.push(vars);
      return {
        nodes: [
          {
            id: "project-1",
            name: "Workspace",
            url: "https://linear.app/acme/project/workspace",
          },
        ],
      };
    },
  };

  const client = {
    client: {
      request: async (query, variables) => {
        records.graphqlRequests.push({ query, variables });
        return searchResponse;
      },
    },
    viewer: async () => {
      records.viewerCalls.push(true);
      return {
        id: "viewer-1",
        name: "Test User",
        email: "test@example.com",
      };
    },
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
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },
    issueLabel: async (id) => {
      records.issueLabels.push(id);
      return { id, name: "Feature" };
    },
  };
  client.records = records;
  return client;
}

test("issue search forwards term and renders matching issues", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, {
      identifier: "REP-2001",
      title: "Share links feature design",
      state: { id: "state-todo", name: "Todo", type: "unstarted" },
    }),
    makeIssue(2, {
      identifier: "REP-2002",
      title: "Share links backend",
      state: { id: "state-backlog", name: "Backlog", type: "backlog" },
    }),
  ]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "share links", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].identifier, "REP-2001");
  assert.equal(payload.items[0].title, "Share links feature design");
  assert.equal(payload.items[1].identifier, "REP-2002");
  assert.equal(client.records.graphqlRequests.length, 1);
  assert.equal(
    client.records.graphqlRequests[0].variables.term,
    "share links",
  );
});

test("issue search requires a term", async () => {
  const result = await execute(
    ["issue", "search"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Usage: linear issue search/);
});

test("issue search --project filters by project", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, { title: "Project item" }),
  ]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "something", "--project", "Workspace", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 1);
  assert.equal(client.records.graphqlRequests.length, 1);
  const variables = client.records.graphqlRequests[0].variables;
  assert.equal(variables.filter.project.id.eq, "project-1");
});

test("issue search --status --limit filters and limits page size", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, { title: "Backlog item" }),
  ]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    [
      "issue",
      "search",
      "test",
      "--status",
      "Backlog",
      "--limit",
      "10",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(client.records.graphqlRequests.length, 1);
  const variables = client.records.graphqlRequests[0].variables;
  assert.equal(variables.filter.state.id.in[0], "state-backlog");
  assert.equal(variables.first, 10);
  assert.equal(variables.term, "test");
});

test("issue search --json outputs valid envelope", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, { identifier: "REP-3001" }),
  ]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "query-term", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.ok(Array.isArray(payload.items));
  assert.ok(typeof payload.pageInfo === "object");
});

test("issue search empty results prints no results", async () => {
  const searchResponse = makeSearchResponse([]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "nonexistent"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "No results.\n");
});

test("issue search rate-limit error surfaces retry hint", async () => {
  const rateLimitError = Object.assign(
    new Error("API rate limit exceeded (429)"),
    { status: 429 },
  );

  const client = makeSearchClient(makeSearchResponse([]));
  client.client.request = async () => {
    throw rateLimitError;
  };

  const result = await execute(
    ["issue", "search", "foo"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Wait a few minutes and try again/);
});

test("issue search --json id,relations requests relations in GraphQL and renders them", async () => {
  const issueWithRelations = makeIssue(1, {
    identifier: "REP-2001",
    title: "Issue with relations",
  });
  issueWithRelations.relations = {
    nodes: [
      {
        id: "rel-1",
        type: "related",
        relatedIssue: {
          id: "other-issue",
          identifier: "REP-3001",
          title: "Related issue",
          url: "https://linear.app/acme/issue/REP-3001",
          state: { id: "s1", name: "Todo", type: "unstarted" },
          assignee: null,
        },
      },
    ],
  };
  issueWithRelations.inverseRelations = { nodes: [] };

  const searchResponse = makeSearchResponse([issueWithRelations]);
  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "test", "--json", "id,relations"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);

  const query = client.records.graphqlRequests[0].query;
  assert.match(query, /relations \{/);
  assert.match(query, /inverseRelations \{/);

  // With explicit projection (--json id,relations), output is a bare array
  const projected = JSON.parse(result.stdout);
  assert.ok(Array.isArray(projected));
  assert.equal(projected.length, 1);
  assert.ok("relations" in projected[0]);
  assert.ok(Array.isArray(projected[0].relations.related));
  assert.equal(projected[0].relations.related.length, 1);
  assert.equal(
    projected[0].relations.related[0].identifier,
    "REP-3001",
  );
});

test("issue search --mine --assignee are mutually exclusive", async () => {
  const result = await execute(
    ["issue", "search", "foo", "--mine", "--assignee", "someone"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    },
  );

  assert.equal(result.code, 2);
  assert.match(
    result.stderr,
    /--mine and --assignee are mutually exclusive/,
  );
});

test("issue search rate-limit retry hint is not doubled when message already contains retry", async () => {
  const alreadyHasRetry = new Error("Rate limited — retry after 30s");

  const client = makeSearchClient(makeSearchResponse([]));
  client.client.request = async () => {
    throw alreadyHasRetry;
  };

  const result = await execute(
    ["issue", "search", "foo"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.notEqual(result.code, 0);
  // The exact error message should appear exactly once (no duplicate hint)
  assert.equal(result.stderr, "Rate limited — retry after 30s\n");
  assert.doesNotMatch(result.stderr, /Wait a few minutes/);
});

test("issue search --limit 0 is rejected", async () => {
  const result = await execute(
    ["issue", "search", "foo", "--limit", "0"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Invalid limit/);
});

test("issue search --limit -1 is rejected", async () => {
  const result = await execute(
    ["issue", "search", "foo", "--limit", "-1"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Invalid limit/);
});

test("issue search --limit 9999 is rejected", async () => {
  const result = await execute(
    ["issue", "search", "foo", "--limit", "9999"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Invalid limit/);
});

test("issue search --mine resolves viewer and adds assignee filter", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, { title: "My issue" }),
  ]);

  const client = makeSearchClient(searchResponse);
  // The search client uses records through the object
  const result = await execute(
    ["issue", "search", "mine-query", "--mine", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(client.records.graphqlRequests.length, 1);
  const variables = client.records.graphqlRequests[0].variables;
  assert.equal(variables.filter.assignee.id.eq, "viewer-1");
});

test("issue search --unblocked --leaf forwards both filters", async () => {
  const searchResponse = makeSearchResponse([
    makeIssue(1, { title: "Unblocked leaf" }),
  ]);

  const client = makeSearchClient(searchResponse);
  const result = await execute(
    ["issue", "search", "leafy", "--unblocked", "--leaf", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(client.records.graphqlRequests.length, 1);
  const variables = client.records.graphqlRequests[0].variables;
  assert.ok(variables.filter.and);
  const hasBlocked = variables.filter.and.find(
    (f) => f.hasBlockedByRelations,
  );
  const leafFilter = variables.filter.and.find((f) => f.children);
  assert.ok(hasBlocked);
  assert.equal(hasBlocked.hasBlockedByRelations.eq, false);
  assert.ok(leafFilter);
  assert.equal(leafFilter.children.length.eq, 0);
});
