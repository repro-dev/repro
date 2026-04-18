function callOrAwait(value, ...args) {
  if (typeof value === "function") {
    return value(...args);
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

export async function resolveTeam(client, teamKey) {
  const result = await callOrAwait(client.teams, {
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
  const result = await callOrAwait(team.projects, {
    filter: { name: { eqIgnoreCase: projectName } },
    first: 20,
  });
  return formatEntityMatches("project", projectName, result?.nodes ?? []);
}

export async function resolveMilestone({ client, project, milestoneName }) {
  const source = project ? project.projectMilestones : client.projectMilestones;
  const result = await callOrAwait(source, {
    filter: { name: { eqIgnoreCase: milestoneName } },
    first: 20,
  });
  return formatEntityMatches("milestone", milestoneName, result?.nodes ?? []);
}

export async function resolveUser(client, userInput) {
  const result = await callOrAwait(client.users, {
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
  const result = await callOrAwait(team.states, { first: 200 });
  return result?.nodes ?? [];
}

export async function resolveLabels(team) {
  const result = await callOrAwait(team.labels, { first: 200 });
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
  return callOrAwait(team.issues, variables);
}

export async function fetchProjectMilestones(source, variables) {
  return callOrAwait(source, variables);
}

export async function fetchIssueLabel(client, labelId) {
  return callOrAwait(client.issueLabel, labelId);
}

export async function fetchProject(projectId, client) {
  if (client.project) {
    return callOrAwait(client.project, projectId);
  }
  return null;
}

export { callOrAwait, normalizeText, unique };
