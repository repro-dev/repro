import assert from "node:assert/strict";
import test from "node:test";

import { fetchIssuesByIdentifiers } from "../api.mjs";

function clientWith(requestFn) {
  return {
    client: {
      request: requestFn,
    },
  };
}

test("fetchIssuesByIdentifiers with single identifier delegates to fetchIssueByNumber-style GraphQL", async () => {
  const requests = [];
  const client = clientWith(async (query, variables) => {
    requests.push({ query, variables });
    return {
      data: {
        team: {
          issues: {
            nodes: [
              {
                id: "issue-1",
                identifier: "REP-101",
                title: "First issue",
                url: "https://linear.app/acme/issue/REP-101",
                state: { id: "state-1", name: "Todo", type: "unstarted" },
                assignee: null,
              },
            ],
          },
        },
      },
    };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  const result = await fetchIssuesByIdentifiers(client, team, [
    { teamKey: "REP", number: 101 },
  ]);

  assert.equal(result.size, 1);
  assert.ok(result.has("REP-101"));
  assert.equal(result.get("REP-101")?.id, "issue-1");
  assert.equal(result.get("REP-101")?.identifier, "REP-101");

  // Single identifier uses the standard IssueByNumber query (not aliased batch)
  assert.equal(requests.length, 1);
  assert.match(requests[0].query, /query IssueByNumber/);
  assert.match(requests[0].query, /\$number: Float!/);
  assert.equal(requests[0].variables.number, 101);
  assert.equal(requests[0].variables.teamId, "team-1");
});

test("fetchIssuesByIdentifiers with multiple identifiers issues ONE raw GraphQL call using aliases", async () => {
  const requests = [];
  const client = clientWith(async (query, variables) => {
    requests.push({ query, variables });
    return {
      data: {
        team: {
          n0: {
            nodes: [
              {
                id: "issue-1",
                identifier: "REP-101",
                title: "First issue",
                url: "https://linear.app/acme/issue/REP-101",
                state: { id: "state-1", name: "Todo", type: "unstarted" },
                assignee: null,
              },
            ],
          },
          n1: {
            nodes: [
              {
                id: "issue-2",
                identifier: "REP-102",
                title: "Second issue",
                url: "https://linear.app/acme/issue/REP-102",
                state: {
                  id: "state-2",
                  name: "In Progress",
                  type: "started",
                },
                assignee: {
                  id: "user-1",
                  name: "Test User",
                  displayName: "Test User",
                  email: "test@example.com",
                },
              },
            ],
          },
        },
      },
    };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  const result = await fetchIssuesByIdentifiers(client, team, [
    { teamKey: "REP", number: 101 },
    { teamKey: "REP", number: 102 },
  ]);

  assert.equal(result.size, 2);
  assert.ok(result.has("REP-101"));
  assert.ok(result.has("REP-102"));
  assert.equal(result.get("REP-101")?.id, "issue-1");
  assert.equal(result.get("REP-102")?.id, "issue-2");
  assert.equal(result.get("REP-102")?.assignee?.name, "Test User");

  // Exactly one GraphQL call with the batch query
  assert.equal(requests.length, 1);
  assert.match(requests[0].query, /query BatchIssues/);
  assert.match(requests[0].query, /n0: issues\(/);
  assert.match(requests[0].query, /n1: issues\(/);
  assert.match(requests[0].query, /number: \{ eq: 101 \}/);
  assert.match(requests[0].query, /number: \{ eq: 102 \}/);
  assert.equal(requests[0].variables.teamId, "team-1");
});

test("fetchIssuesByIdentifiers returns correct Map keyed by identifier string", async () => {
  const requests = [];
  const client = clientWith(async (query, variables) => {
    requests.push({ query, variables });
    return {
      data: {
        team: {
          n0: {
            nodes: [
              {
                id: "issue-1",
                identifier: "REP-101",
                title: "First issue",
                url: "https://linear.app/acme/issue/REP-101",
                state: { id: "state-1", name: "Todo", type: "unstarted" },
                assignee: null,
              },
            ],
          },
          n1: {
            nodes: [
              {
                id: "issue-2",
                identifier: "REP-203",
                title: "Other team issue",
                url: "https://linear.app/acme/issue/REP-203",
                state: { id: "state-3", name: "Done", type: "completed" },
                assignee: null,
              },
            ],
          },
        },
      },
    };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  const result = await fetchIssuesByIdentifiers(client, team, [
    { teamKey: "REP", number: 101 },
    { teamKey: "REP", number: 203 },
  ]);

  // Keys are "TEAM-NNN" format
  const keys = [...result.keys()];
  assert.deepEqual(keys.sort(), ["REP-101", "REP-203"]);

  // Values are issue objects (or null for missing)
  assert.equal(result.get("REP-101")?.identifier, "REP-101");
  assert.equal(result.get("REP-203")?.identifier, "REP-203");
});

test("fetchIssuesByIdentifiers deduplicates identifiers", async () => {
  const requests = [];
  const client = clientWith(async (query, variables) => {
    requests.push({ query, variables });
    return {
      data: {
        team: {
          issues: {
            nodes: [
              {
                id: "issue-1",
                identifier: "REP-101",
                title: "First issue",
                url: "https://linear.app/acme/issue/REP-101",
                state: { id: "state-1", name: "Todo", type: "unstarted" },
                assignee: null,
              },
            ],
          },
        },
      },
    };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  // Same identifier provided twice
  const result = await fetchIssuesByIdentifiers(client, team, [
    { teamKey: "REP", number: 101 },
    { teamKey: "REP", number: 101 },
  ]);

  assert.equal(result.size, 1);
  assert.ok(result.has("REP-101"));

  // Since dedup leaves 1, it delegates to single-identifier path
  assert.equal(requests.length, 1);
  assert.match(requests[0].query, /query IssueByNumber/);
});

test("fetchIssuesByIdentifiers with zero identifiers returns empty map", async () => {
  const requests = [];
  const client = clientWith(async () => {
    requests.push("should-not-be-called");
    return { data: {} };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  const result = await fetchIssuesByIdentifiers(client, team, []);

  assert.equal(result.size, 0);
  // No GraphQL calls should be made
  assert.equal(requests.length, 0);
});

test("fetchIssuesByIdentifiers returns null entries for missing issues", async () => {
  const requests = [];
  const client = clientWith(async (query, variables) => {
    requests.push({ query, variables });
    return {
      data: {
        team: {
          n0: {
            nodes: [],
          },
          n1: {
            nodes: [
              {
                id: "issue-2",
                identifier: "REP-102",
                title: "Found issue",
                url: "https://linear.app/acme/issue/REP-102",
                state: { id: "state-2", name: "Todo", type: "unstarted" },
                assignee: null,
              },
            ],
          },
        },
      },
    };
  });

  const team = { id: "team-1", key: "REP", name: "Workspace" };

  const result = await fetchIssuesByIdentifiers(client, team, [
    { teamKey: "REP", number: 999 },
    { teamKey: "REP", number: 102 },
  ]);

  assert.equal(result.size, 2);
  assert.equal(result.get("REP-999"), null);
  assert.equal(result.get("REP-102")?.id, "issue-2");
  assert.equal(requests.length, 1);
});
