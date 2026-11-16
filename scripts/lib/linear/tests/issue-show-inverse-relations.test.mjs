import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

const SELF = {
  id: "issue-self",
  identifier: "REP-900",
  title: "Issue under test",
  url: "https://linear.app/acme/issue/REP-900",
};

function summary(identifier, id, title) {
  return {
    id,
    identifier,
    title,
    url: `https://linear.app/acme/issue/${identifier}`,
    state: { id: "state-todo", name: "Todo", type: "unstarted" },
    assignee: null,
  };
}

// Linear's inverse direction: the other issue is `issue`, this issue is `relatedIssue`.
function inverseNode(id, type, other) {
  return {
    id,
    type,
    issue: other,
    relatedIssue: SELF,
  };
}

function makeIssue({ inverseRelations, relations = { nodes: [] } }) {
  return {
    id: SELF.id,
    identifier: SELF.identifier,
    title: SELF.title,
    url: SELF.url,
    branchName: "rep-900-issue-under-test",
    priority: 2,
    priorityLabel: "High",
    updatedAt: "2026-04-18T00:00:00.000Z",
    description: "desc",
    project: null,
    projectMilestone: null,
    assignee: null,
    parent: null,
    state: { id: "state-todo", name: "Todo", type: "unstarted" },
    labels: { nodes: [] },
    comments: { nodes: [] },
    relations,
    inverseRelations,
  };
}

function makeFixtureClient(issue, records) {
  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
  };

  return {
    client: {
      request: async (query, variables) => {
        records.graphqlRequests.push({ query, variables });
        return { team: { issues: { nodes: [issue] } } };
      },
    },
    teams: async () => ({ nodes: [team] }),
  };
}

async function showJson(issue) {
  const records = { graphqlRequests: [] };
  const result = await execute(["issue", "show", "REP-900", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeFixtureClient(issue, records),
  });
  assert.equal(result.code, 0, result.stderr);
  return { payload: JSON.parse(result.stdout), records };
}

const EMPTY_PAGE = { hasNextPage: false, endCursor: null };

test("issue show --json exposes one blocker as inverseRelations in Linear's shape", async () => {
  const blocker = summary("REP-901", "issue-901", "Blocker one");
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: {
        nodes: [inverseNode("rel-1", "blocks", blocker)],
        pageInfo: EMPTY_PAGE,
      },
    }),
  );

  const inverse = payload.item.inverseRelations;
  assert.deepEqual(Object.keys(inverse).sort(), ["nodes", "pageInfo"]);
  assert.equal(inverse.nodes.length, 1);
  assert.equal(inverse.nodes[0].type, "blocks");
  assert.equal(inverse.nodes[0].issue.identifier, "REP-901");
  assert.equal(inverse.nodes[0].issue.title, "Blocker one");
  assert.deepEqual(inverse.pageInfo, { hasNextPage: false, endCursor: null });
});

test("issue show --json lists two blockers in inverseRelations", async () => {
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: {
        nodes: [
          inverseNode(
            "rel-1",
            "blocks",
            summary("REP-901", "issue-901", "Blocker one"),
          ),
          inverseNode(
            "rel-2",
            "blocks",
            summary("REP-902", "issue-902", "Blocker two"),
          ),
        ],
        pageInfo: EMPTY_PAGE,
      },
    }),
  );

  const blockers = payload.item.inverseRelations.nodes.filter(
    (node) => node.type === "blocks",
  );
  assert.deepEqual(
    blockers.map((node) => node.issue.identifier),
    ["REP-901", "REP-902"],
  );
  assert.equal(payload.item.inverseRelations.pageInfo.hasNextPage, false);
});

test("issue show --json returns empty inverseRelations.nodes when nothing blocks the issue", async () => {
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: { nodes: [], pageInfo: EMPTY_PAGE },
    }),
  );

  assert.deepEqual(payload.item.inverseRelations, {
    nodes: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  });
});

test("a related link is kept with type related and never reads as a blocker", async () => {
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: {
        nodes: [
          inverseNode(
            "rel-blocker",
            "blocks",
            summary("REP-901", "issue-901", "Real blocker"),
          ),
          inverseNode(
            "rel-related",
            "related",
            summary("REP-903", "issue-903", "Just related"),
          ),
        ],
        pageInfo: EMPTY_PAGE,
      },
    }),
  );

  const blockers = payload.item.inverseRelations.nodes.filter(
    (node) => node.type === "blocks",
  );
  assert.deepEqual(
    blockers.map((node) => node.issue.identifier),
    ["REP-901"],
  );
  const related = payload.item.inverseRelations.nodes.find(
    (node) => node.id === "rel-related",
  );
  assert.equal(related.type, "related");
  // The normalised relations output still puts it under related, not blockedBy.
  assert.deepEqual(
    payload.item.relations.related.map((entry) => entry.identifier),
    ["REP-903"],
  );
  assert.deepEqual(
    payload.item.relations.blockedBy.map((entry) => entry.identifier),
    ["REP-901"],
  );
});

test("a multi-page inverseRelations connection reports hasNextPage and endCursor honestly", async () => {
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: {
        nodes: [
          inverseNode(
            "rel-1",
            "blocks",
            summary("REP-901", "issue-901", "Blocker one"),
          ),
        ],
        pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
      },
    }),
  );

  assert.deepEqual(payload.item.inverseRelations.pageInfo, {
    hasNextPage: true,
    endCursor: "cursor-2",
  });
  assert.equal(payload.item.inverseRelations.nodes.length, 1);
});

test("issue show --json keeps the normalised relations output unchanged", async () => {
  const { payload } = await showJson(
    makeIssue({
      inverseRelations: {
        nodes: [
          inverseNode(
            "rel-1",
            "blocks",
            summary("REP-901", "issue-901", "Blocker one"),
          ),
        ],
        pageInfo: EMPTY_PAGE,
      },
      relations: {
        nodes: [
          {
            id: "rel-out",
            type: "blocks",
            issue: SELF,
            relatedIssue: summary("REP-904", "issue-904", "Blocked item"),
          },
        ],
      },
    }),
  );

  assert.deepEqual(payload.item.relations, {
    blocks: [
      {
        id: "issue-904",
        identifier: "REP-904",
        title: "Blocked item",
        url: "https://linear.app/acme/issue/REP-904",
        status: { id: "state-todo", name: "Todo", type: "unstarted" },
        assignee: null,
        relationId: "rel-out",
        relationType: "blocks",
      },
    ],
    blockedBy: [
      {
        id: "issue-901",
        identifier: "REP-901",
        title: "Blocker one",
        url: "https://linear.app/acme/issue/REP-901",
        status: { id: "state-todo", name: "Todo", type: "unstarted" },
        assignee: null,
        relationId: "rel-1",
        relationType: "blocks",
      },
    ],
    related: [],
    duplicates: [],
    duplicateOf: [],
  });
});

test("the issue show query asks Linear for inverseRelations with pageInfo", async () => {
  const { records } = await showJson(
    makeIssue({
      inverseRelations: { nodes: [], pageInfo: EMPTY_PAGE },
    }),
  );

  const query = records.graphqlRequests[0].query;
  assert.match(query, /inverseRelations \{\s*nodes \{/);
  assert.match(
    query,
    /inverseRelations \{[\s\S]*pageInfo \{\s*hasNextPage\s*endCursor\s*\}/,
  );
});
