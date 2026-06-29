function callOrAwait(value, ...args) {
  if (typeof value === "function") {
    return value(...args);
  }

  return value;
}

function callBoundMethod(receiver, value, ...args) {
  if (typeof value === "function") {
    return value.apply(receiver, args);
  }

  return value;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values)];
}

function formatEntityMatches(
  kind,
  query,
  nodes,
  formatter = (value) =>
    value.name ?? value.displayName ?? value.key ?? value.id,
) {
  if (nodes.length === 1) return nodes[0];

  if (nodes.length === 0) {
    throw new Error(`Unknown ${kind}: ${query}`);
  }

  const matches = nodes.map(formatter).filter(Boolean).join(", ");
  throw new Error(`Ambiguous ${kind} ${JSON.stringify(query)}: ${matches}`);
}

export async function createLinearClient(apiKey, clientFactory) {
  if (clientFactory) {
    return clientFactory(apiKey);
  }

  const { LinearClient } = await import("@linear/sdk");
  return new LinearClient({ apiKey });
}

const ISSUE_BY_NUMBER_SUMMARY_FIELDS = [
  "id",
  "identifier",
  "title",
  "url",
  "state { id name type }",
  "assignee { id name displayName email }",
].join("\n            ");

const BATCH_ISSUE_FIELDS = [
  "id",
  "identifier",
  "title",
  "url",
  "state { id name type }",
  "assignee { id name displayName email }",
].join("\n              ");

const ISSUE_BY_NUMBER_QUERY = [
  "query IssueByNumber($teamId: String!, $number: Float!) {",
  "  team(id: $teamId) {",
  "    issues(filter: { number: { eq: $number } }, first: 1) {",
  "      nodes {",
  "        id",
  "        identifier",
  "        title",
  "        branchName",
  "        url",
  "        priority",
  "        priorityLabel",
  "        updatedAt",
  "        description",
  "        project { id name url updatedAt }",
  "        projectMilestone {",
  "          id",
  "          name",
  "          targetDate",
  "          updatedAt",
  "          project { id name url updatedAt }",
  "        }",
  "        assignee { id name displayName email }",
  "        state { id name type }",
  "        parent {",
  `          ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}`,
  "        }",
  "        labels { nodes { id name } }",
  "        comments {",
  "          nodes {",
  "            id",
  "            body",
  "            createdAt",
  "            updatedAt",
  "            user { id name displayName email }",
  "          }",
  "        }",
  "        relations {",
  "          nodes {",
  "            id",
  "            type",
  `            issue {\n              ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n            }`,
  `            relatedIssue {\n              ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n            }`,
  "          }",
  "        }",
  "        inverseRelations {",
  "          nodes {",
  "            id",
  "            type",
  `            issue {\n              ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n            }`,
  `            relatedIssue {\n              ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n            }`,
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}",
].join("\n");

export async function requestLinearGraphQL(client, query, variables) {
  const graphQLClient = client?.client;
  const request = graphQLClient?.request ?? graphQLClient?.rawRequest;

  if (typeof request !== "function") {
    throw new Error(
      "Linear client does not expose a raw GraphQL request method",
    );
  }

  // The SDK's list helpers lock the selection set, so projection-aware reads
  // go through the underlying GraphQL client when we need inline relation data.
  const response = await callBoundMethod(
    graphQLClient,
    request,
    query,
    variables,
  );
  return response?.data ?? response;
}

export async function resolveTeam(client, teamKey) {
  const result = await callBoundMethod(client, client.teams, {
    filter: { key: { eqIgnoreCase: teamKey } },
    first: 20,
  });
  return formatEntityMatches(
    "team",
    teamKey,
    result?.nodes ?? [],
    (team) => `${team.name} (${team.key})`,
  );
}

export async function resolveViewer(client) {
  return callOrAwait(client.viewer);
}

export async function resolveProject(team, projectName) {
  const result = await callBoundMethod(team, team.projects, {
    filter: { name: { eqIgnoreCase: projectName } },
    first: 20,
  });
  return formatEntityMatches("project", projectName, result?.nodes ?? []);
}

export async function resolveMilestone({ client, project, milestoneName }) {
  const source = project ? project.projectMilestones : client.projectMilestones;
  const receiver = project ?? client;
  const result = await callBoundMethod(receiver, source, {
    filter: { name: { eqIgnoreCase: milestoneName } },
    first: 20,
  });
  return formatEntityMatches("milestone", milestoneName, result?.nodes ?? []);
}

export async function resolveUser(client, userInput) {
  const result = await callBoundMethod(client, client.users, {
    filter: {
      or: [
        { email: { eqIgnoreCase: userInput } },
        { displayName: { eqIgnoreCase: userInput } },
        { name: { eqIgnoreCase: userInput } },
      ],
    },
    first: 20,
  });
  return formatEntityMatches(
    "assignee",
    userInput,
    result?.nodes ?? [],
    (user) => `${user.name ?? user.displayName} <${user.email ?? "unknown"}>`,
  );
}

export async function resolveStates(team) {
  const result = await callBoundMethod(team, team.states, { first: 200 });
  return result?.nodes ?? [];
}

export async function resolveLabels(team) {
  const result = await callBoundMethod(team, team.labels, { first: 200 });
  return result?.nodes ?? [];
}

export function normalizeStatusInput(value) {
  const normalized = normalizeText(value);
  if (normalized === "cancelled") return "canceled";
  return normalized;
}

export function resolveStatuses(states, requestedStatuses) {
  const matches = [];
  const unknown = [];
  const lookup = states.map((state) => ({
    state,
    normalizedName: normalizeStatusInput(state.name),
    normalizedType: normalizeStatusInput(state.type),
  }));

  for (const requested of requestedStatuses) {
    const normalized = normalizeStatusInput(requested);
    const found = lookup.find(
      ({ normalizedName, normalizedType }) =>
        normalizedName === normalized || normalizedType === normalized,
    );
    if (found) {
      matches.push(found.state);
    } else {
      unknown.push(requested);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown status: ${unknown.join(", ")}`);
  }

  return unique(matches.map((state) => state.id))
    .map((id) => states.find((state) => state.id === id))
    .filter(Boolean);
}

export function resolveLabelsByName(labels, requestedLabels) {
  const matches = [];
  const unknown = [];
  const lookup = labels.map((label) => ({
    label,
    normalizedName: normalizeText(label.name),
  }));

  for (const requested of requestedLabels) {
    const normalized = normalizeText(requested);
    const found = lookup.find((entry) => entry.normalizedName === normalized);
    if (found) {
      matches.push(found.label);
    } else {
      unknown.push(requested);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown label: ${unknown.join(", ")}`);
  }

  return unique(matches.map((label) => label.id))
    .map((id) => labels.find((label) => label.id === id))
    .filter(Boolean);
}

export function resolveDefaultBacklogStates(states) {
  const backlogMatches = resolveStatuses(states, ["backlog", "todo"]);
  return backlogMatches;
}

export function buildIssueFilter({
  project,
  milestone,
  statusIds,
  labelIds,
  assignee,
  viewer,
  priority,
  mine,
  unblocked,
  leaf,
  open,
  defaultBacklogStateIds,
}) {
  const filters = [];

  if (project) filters.push({ project: { id: { eq: project.id } } });
  if (milestone)
    filters.push({ projectMilestone: { id: { eq: milestone.id } } });
  if (statusIds?.length) filters.push({ state: { id: { in: statusIds } } });
  if (open)
    filters.push({
      state: { type: { nin: ["completed", "canceled", "duplicate"] } },
    });
  if (priority !== null && priority !== undefined)
    filters.push({ priority: { eq: priority } });
  if (mine && viewer?.id) filters.push({ assignee: { id: { eq: viewer.id } } });
  if (assignee) filters.push({ assignee: { id: { eq: assignee.id } } });
  if (unblocked) filters.push({ hasBlockedByRelations: { eq: false } });
  if (leaf) filters.push({ children: { length: { eq: 0 } } });

  for (const labelId of labelIds ?? []) {
    filters.push({ labels: { some: { id: { eq: labelId } } } });
  }

  if (!filters.length && defaultBacklogStateIds?.length) {
    filters.push({ state: { id: { in: defaultBacklogStateIds } } });
  }

  if (!filters.length) return {};
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export async function fetchIssues(team, variables) {
  return callBoundMethod(team, team.issues, variables);
}

export async function fetchIssueByNumber(client, team, number) {
  const response = await requestLinearGraphQL(client, ISSUE_BY_NUMBER_QUERY, {
    teamId: team.id,
    number,
  });

  return response?.team?.issues;
}

export async function fetchIssuesByIdentifiers(client, team, issueIdentifiers) {
  // Deduplicate by teamKey-number
  const seen = new Set();
  const deduped = [];
  for (const ident of issueIdentifiers) {
    const key = `${ident.teamKey}-${ident.number}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ident);
    }
  }

  // Empty input: return empty map without making any API call
  if (deduped.length === 0) {
    return new Map();
  }

  // Single identifier: delegate to existing single-lookup path (no overhead)
  if (deduped.length === 1) {
    const { teamKey, number } = deduped[0];
    const response = await fetchIssueByNumber(client, team, number);
    const issue = response?.nodes?.[0] ?? null;
    const result = new Map();
    result.set(`${teamKey}-${number}`, issue);
    return result;
  }

  // Multiple identifiers: build aliased batch query
  const aliasNodes = deduped
    .map(
      ({ number }, index) =>
        `      n${index}: issues(filter: { number: { eq: ${number} } }, first: 1) {
        nodes {
          ${BATCH_ISSUE_FIELDS}
        }
      }`,
    )
    .join("\n");

  const query = [
    "query BatchIssues($teamId: String!) {",
    "  team(id: $teamId) {",
    aliasNodes,
    "  }",
    "}",
  ].join("\n");

  const response = await requestLinearGraphQL(client, query, {
    teamId: team.id,
  });

  const teamData = response?.team;
  if (!teamData) return new Map();

  const result = new Map();
  for (let i = 0; i < deduped.length; i++) {
    const { teamKey, number } = deduped[i];
    const alias = `n${i}`;
    const nodes = teamData[alias]?.nodes;
    const issue = nodes?.[0] ?? null;
    result.set(`${teamKey}-${number}`, issue);
  }

  return result;
}

export async function fetchProjectMilestones(receiver, source, variables) {
  return callBoundMethod(receiver, source, variables);
}

export async function fetchIssueLabel(client, labelId) {
  return callBoundMethod(client, client.issueLabel, labelId);
}

export async function createIssueWithFallback(receiver, payload) {
  for (const methodName of ["createIssue", "issueCreate"]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], payload);
    }
  }

  return null;
}

export async function createDocumentWithFallback(receiver, payload) {
  for (const methodName of ["createDocument", "documentCreate"]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], payload);
    }
  }

  return null;
}

export async function updateDocumentWithFallback(receiver, id, payload) {
  for (const methodName of ["updateDocument", "documentUpdate"]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], id, payload);
    }
  }

  return null;
}

export async function createAttachmentWithFallback(receiver, payload) {
  for (const methodName of ["createAttachment", "attachmentCreate"]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], payload);
    }
  }

  return null;
}

export async function createIssueLabelWithFallback(receiver, payload) {
  for (const methodName of [
    "createIssueLabel",
    "createLabel",
    "issueLabelCreate",
  ]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], payload);
    }
  }

  return null;
}

export async function createIssueRelationWithFallback(receiver, payload) {
  for (const methodName of ["createIssueRelation", "issueRelationCreate"]) {
    if (typeof receiver?.[methodName] === "function") {
      return callBoundMethod(receiver, receiver[methodName], payload);
    }
  }

  return null;
}

export function buildSearchIssuesQuery(fields) {
  const requestedFields = new Set(fields ?? []);
  const selectStatus = !fields || requestedFields.has("status");
  const selectProject = !fields || requestedFields.has("project");
  const selectMilestone = !fields || requestedFields.has("milestone");
  const selectAssignee = !fields || requestedFields.has("assignee");
  const selectLabels = !fields || requestedFields.has("labels");
  const selectDescription = !fields || requestedFields.has("description");
  const selectComments = !fields || requestedFields.has("comments");
  const selectRelations = !fields || requestedFields.has("relations");

  const issueFields = [
    "id",
    "identifier",
    "title",
    "url",
    "priority",
    "priorityLabel",
    "updatedAt",
    selectDescription ? "description" : null,
    selectStatus ? "state { id name type }" : null,
    selectProject ? "project { id name url updatedAt }" : null,
    selectMilestone
      ? [
          "projectMilestone {",
          "  id",
          "  name",
          "  targetDate",
          "  updatedAt",
          "  project { id name url updatedAt }",
          "}",
        ].join("\n        ")
      : null,
    selectAssignee ? "assignee { id name displayName email }" : null,
    selectLabels ? "labels { nodes { id name } }" : null,
    selectComments
      ? [
          "comments {",
          "  nodes {",
          "    id",
          "    body",
          "    createdAt",
          "    updatedAt",
          "    user { id name displayName email }",
          "  }",
          "}",
        ].join("\n        ")
      : null,
    selectRelations
      ? [
          "relations {",
          "  nodes {",
          "    id",
          "    type",
          `    issue {\n        ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n      }`,
          `    relatedIssue {\n        ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n      }`,
          "  }",
          "}",
          "inverseRelations {",
          "  nodes {",
          "    id",
          "    type",
          `    issue {\n        ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n      }`,
          `    relatedIssue {\n        ${ISSUE_BY_NUMBER_SUMMARY_FIELDS}\n      }`,
          "  }",
          "}",
        ].join("\n        ")
      : null,
  ]
    .filter(Boolean)
    .join("\n        ");

  return [
    "query IssueSearch($term: String!, $filter: IssueFilter, $first: Int, $after: String, $teamId: String) {",
    "  searchIssues(",
    "    term: $term",
    "    filter: $filter",
    "    first: $first",
    "    after: $after",
    "    teamId: $teamId",
    "  ) {",
    "    nodes {",
    `      ${issueFields}`,
    "    }",
    "    pageInfo {",
    "      hasNextPage",
    "      endCursor",
    "    }",
    "    totalCount",
    "  }",
    "}",
  ].join("\n");
}

export async function fetchSearchIssues(client, variables) {
  const { term, filter, first, after, teamId, fields } = variables;
  const query = buildSearchIssuesQuery(fields ?? null);
  const response = await requestLinearGraphQL(client, query, {
    term,
    filter,
    first,
    after,
    teamId,
  });
  return response?.searchIssues ?? null;
}

export async function fetchProject(projectId, client) {
  if (client.project) {
    return callBoundMethod(client, client.project, projectId);
  }
  return null;
}

export { callOrAwait, callBoundMethod, normalizeText, unique };
