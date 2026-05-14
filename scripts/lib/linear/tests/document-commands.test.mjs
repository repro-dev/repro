import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";

import { execute } from "../cli.mjs";

function makeStdin(content, isTTY = false) {
  const stdin = new PassThrough();
  stdin.isTTY = isTTY;
  if (content !== null) {
    stdin.end(content);
  }
  return stdin;
}

function makeDocumentClient(records, options = {}) {
  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({ nodes: [] }),
    labels: async () => ({ nodes: [] }),
    projects: async () => ({ nodes: [] }),
    issues: async ({ filter } = {}) => {
      if (filter?.number?.eq === 875) {
        return { nodes: [records.issues.REP875] };
      }
      if (filter?.number?.eq === 876) {
        return { nodes: [records.issues.REP876] };
      }
      return { nodes: [] };
    },
  };

  const client = {
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
    issueLabel: async (id) => ({ id, name: id }),
    document: async (id) => records.documents[id] ?? null,
    ...(options.includePrimaryMethods === false
      ? {}
      : {
          createDocument: async (payload) => {
            records.createDocument.push(payload);
            return {
              document:
                records.createdDocuments[payload.title] ??
                records.createdDocuments.default,
            };
          },
          updateDocument: async (id, payload) => {
            records.updateDocument.push({ id, payload });
            return {
              document:
                records.updatedDocuments[id] ??
                records.updatedDocuments.default,
            };
          },
          createAttachment: async (payload) => {
            records.createAttachment.push(payload);
            return {
              attachment:
                records.createdAttachments[payload.issueId] ??
                records.createdAttachments.default,
            };
          },
        }),
    ...(options.includeFallbackMethods
      ? {
          documentCreate: async (payload) => {
            records.documentCreate.push(payload);
            return {
              document:
                records.createdDocuments[payload.title] ??
                records.createdDocuments.default,
            };
          },
          documentUpdate: async (id, payload) => {
            records.documentUpdate.push({ id, payload });
            return {
              document:
                records.updatedDocuments[id] ??
                records.updatedDocuments.default,
            };
          },
          attachmentCreate: async (payload) => {
            records.attachmentCreate.push(payload);
            return {
              attachment:
                records.createdAttachments[payload.issueId] ??
                records.createdAttachments.default,
            };
          },
        }
      : {}),
  };

  return client;
}

function makeRecords() {
  return {
    issues: {
      REP875: {
        id: "issue-875",
        identifier: "REP-875",
        title: "First issue",
        url: "https://linear.app/acme/issue/REP-875",
        priority: 2,
        priorityLabel: "High",
        state: Promise.resolve(null),
        project: Promise.resolve(null),
        projectMilestone: Promise.resolve(null),
        assignee: Promise.resolve(null),
      },
      REP876: {
        id: "issue-876",
        identifier: "REP-876",
        title: "Second issue",
        url: "https://linear.app/acme/issue/REP-876",
        priority: 2,
        priorityLabel: "High",
        state: Promise.resolve(null),
        project: Promise.resolve(null),
        projectMilestone: Promise.resolve(null),
        assignee: Promise.resolve(null),
      },
    },
    documents: {
      "handbook-abc123": {
        id: "doc-1",
        title: "Handbook",
        url: "https://linear.app/acme/doc/handbook-abc123",
        content: "# Handbook",
        slugId: "handbook-abc123",
        createdAt: new Date("2026-04-18T00:00:00.000Z"),
        updatedAt: new Date("2026-04-19T00:00:00.000Z"),
        issueId: "issue-875",
        teamId: "team-1",
      },
    },
    createdDocuments: {
      default: {
        id: "doc-created",
        title: "Created doc",
        url: "https://linear.app/acme/doc/created-doc",
        content: "Created body",
        slugId: "created-doc",
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        teamId: "team-1",
      },
      "Attachment title": {
        id: "doc-attached",
        title: "Attachment title",
        url: "https://linear.app/acme/doc/attached-doc",
        content: "Attachment body\n",
        slugId: "attached-doc",
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        issueId: "issue-875",
      },
    },
    updatedDocuments: {
      default: {
        id: "doc-1",
        title: "Updated handbook",
        url: "https://linear.app/acme/doc/handbook-abc123",
        content: "Updated body",
        slugId: "handbook-abc123",
        createdAt: new Date("2026-04-18T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        issueId: "issue-875",
        teamId: "team-1",
      },
    },
    createdAttachments: {
      default: {
        id: "att-1",
        title: "Linear document",
        url: "https://linear.app/acme/doc/handbook-abc123",
        issueId: "issue-875",
      },
      "issue-875": {
        id: "att-1",
        title: "Linear document",
        url: "https://linear.app/acme/doc/handbook-abc123",
        issueId: "issue-875",
      },
      "issue-876": {
        id: "att-2",
        title: "Linear document",
        url: "https://linear.app/acme/doc/handbook-abc123",
        issueId: "issue-876",
      },
    },
    createDocument: [],
    updateDocument: [],
    createAttachment: [],
    documentCreate: [],
    documentUpdate: [],
    attachmentCreate: [],
  };
}

test("document create reads stdin and targets the active team", async () => {
  const records = makeRecords();
  const result = await execute(
    ["document", "create", "--title", "Created doc", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
      stdin: makeStdin("# Created body\n"),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(records.createDocument, [
    { teamId: "team-1", title: "Created doc", content: "# Created body\n" },
  ]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.title, "Created doc");
  assert.equal(payload.item.teamId, "team-1");
  assert.equal(payload.item.content, "Created body");
});

test("document create can scope the document to one issue", async () => {
  const records = makeRecords();
  const result = await execute(
    [
      "document",
      "create",
      "--title",
      "Issue doc",
      "--issue",
      "REP-875",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
      stdin: makeStdin("Issue body\n"),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(records.createDocument, [
    { issueId: "issue-875", title: "Issue doc", content: "Issue body\n" },
  ]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.issueId, "issue-875");
});

test("document show resolves a document url and returns stable fields", async () => {
  const records = makeRecords();
  const result = await execute(
    [
      "document",
      "show",
      "https://linear.app/acme/doc/handbook-abc123",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
    },
  );

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.id, "doc-1");
  assert.equal(payload.item.slugId, "handbook-abc123");
  assert.equal(payload.item.issueId, "issue-875");
  assert.equal(payload.item.createdAt, "2026-04-18T00:00:00.000Z");
});

test("document update accepts title changes and piped content", async () => {
  const records = makeRecords();
  const result = await execute(
    [
      "document",
      "update",
      "https://linear.app/acme/doc/handbook-abc123",
      "--title",
      "Updated handbook",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
      stdin: makeStdin("Updated body\n"),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(records.updateDocument, [
    {
      id: "handbook-abc123",
      payload: { title: "Updated handbook", content: "Updated body\n" },
    },
  ]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.title, "Updated handbook");
  assert.equal(payload.item.content, "Updated body");
});

test("document link creates one attachment per issue", async () => {
  const records = makeRecords();
  const result = await execute(
    [
      "document",
      "link",
      "https://linear.app/acme/doc/handbook-abc123",
      "--issue",
      "REP-875",
      "--issue",
      "REP-876",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(records.createAttachment, [
    {
      issueId: "issue-875",
      title: "Linear document",
      url: "https://linear.app/acme/doc/handbook-abc123",
    },
    {
      issueId: "issue-876",
      title: "Linear document",
      url: "https://linear.app/acme/doc/handbook-abc123",
    },
  ]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.pageInfo.hasNextPage, false);
});

test("issue attach compatibility creates an issue-scoped document", async () => {
  const records = makeRecords();
  const result = await execute(
    ["issue", "attach", "REP-875", "--document", "Attachment title", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(records),
      stdin: makeStdin("Attachment body\n"),
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(records.createDocument, [
    {
      issueId: "issue-875",
      title: "Attachment title",
      content: "Attachment body\n",
    },
  ]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.issueId, "issue-875");
  assert.equal(payload.item.title, "Attachment title");
});

test("document commands fall back to legacy SDK method names", async () => {
  const records = makeRecords();
  const clientFactory = async () =>
    makeDocumentClient(records, {
      includePrimaryMethods: false,
      includeFallbackMethods: true,
    });

  const created = await execute(
    ["document", "create", "--title", "Created doc", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
      stdin: makeStdin("Fallback body\n"),
    },
  );
  const updated = await execute(
    [
      "document",
      "update",
      "https://linear.app/acme/doc/handbook-abc123",
      "--title",
      "Updated handbook",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
      stdin: makeStdin("Updated fallback body\n"),
    },
  );
  const linked = await execute(
    [
      "document",
      "link",
      "https://linear.app/acme/doc/handbook-abc123",
      "--issue",
      "REP-875",
      "--json",
    ],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );

  assert.equal(created.code, 0);
  assert.equal(updated.code, 0);
  assert.equal(linked.code, 0);
  assert.deepEqual(records.documentCreate, [
    { teamId: "team-1", title: "Created doc", content: "Fallback body\n" },
  ]);
  assert.deepEqual(records.documentUpdate, [
    {
      id: "handbook-abc123",
      payload: {
        title: "Updated handbook",
        content: "Updated fallback body\n",
      },
    },
  ]);
  assert.deepEqual(records.attachmentCreate, [
    {
      issueId: "issue-875",
      title: "Linear document",
      url: "https://linear.app/acme/doc/handbook-abc123",
    },
  ]);
});

test("document update rejects no-op updates", async () => {
  const result = await execute(
    ["document", "update", "https://linear.app/acme/doc/handbook-abc123"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => makeDocumentClient(makeRecords()),
      stdin: makeStdin(""),
    },
  );

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Missing update fields\./);
});
