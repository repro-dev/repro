import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { execute } from "../cli.mjs";

function makeClient() {
  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async () => ({
      nodes: [
        { id: "state-backlog", name: "Backlog", type: "backlog" },
        { id: "state-todo", name: "Todo", type: "unstarted" },
      ],
    }),
    labels: async () => ({ nodes: [] }),
    projects: async () => ({ nodes: [] }),
    issues: async () => ({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };

  return {
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
  };
}

function makeBoundMethodClient(records) {
  records.milestoneProjectAccesses ??= [];
  const makeMilestone = () => ({
    id: "ms-1",
    name: "Sprint 1",
    targetDate: null,
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    get project() {
      records.milestoneProjectAccesses.push(true);
      return Promise.resolve(project);
    },
  });

  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    _request: {},
    projectMilestones: async function (vars) {
      if (!this._request) throw new Error("unbound projectMilestones method");
      records.projectMilestones.push(vars);
      return {
        nodes: [makeMilestone()],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    _request: {},
    states: async function () {
      if (!this._request) throw new Error("unbound states method");
      return { nodes: [] };
    },
    labels: async function () {
      if (!this._request) throw new Error("unbound labels method");
      return { nodes: [] };
    },
    projects: async function (vars) {
      if (!this._request) throw new Error("unbound projects method");
      records.projects.push(vars);
      return { nodes: [project] };
    },
    issues: async function () {
      if (!this._request) throw new Error("unbound issues method");
      return {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
  };

  return {
    _request: {},
    viewer: async () => ({
      id: "viewer-1",
      name: "Test User",
      email: "test@example.com",
    }),
    teams: async function (vars) {
      if (!this._request) throw new Error("unbound teams method");
      records.teams.push(vars);
      return { nodes: [team] };
    },
    users: async function () {
      if (!this._request) throw new Error("unbound users method");
      return { nodes: [] };
    },
    projectMilestones: async function (vars) {
      if (!this._request) throw new Error("unbound projectMilestones method");
      records.projectMilestones.push(vars);
      return {
        nodes: [makeMilestone()],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    issueLabel: async function () {
      if (!this._request) throw new Error("unbound issueLabel method");
      return { id: "label-1", name: "Feature" };
    },
  };
}

test("top-level help prints command surface", async () => {
  const result = await execute(["--help"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /whoami/);
  assert.match(result.stdout, /linear issue list/);
  assert.match(result.stdout, /issue create/);
  assert.match(result.stdout, /issue children <id>/);
  assert.match(result.stdout, /issue start <id>/);
  assert.match(result.stdout, /issue update <id>/);
  assert.match(result.stdout, /issue comment <id> <body>/);
  assert.match(result.stdout, /issue attach <id> --document <title>/);
  assert.match(result.stdout, /document create --title <title>/);
  assert.match(result.stdout, /document link <url>/);
  assert.match(result.stdout, /label list/);
  assert.match(result.stdout, /label create --name <name>/);
  assert.match(result.stdout, /login/);
  assert.match(result.stdout, /statuses backlog and todo/i);
});

test("login help describes the required flags", async () => {
  const result = await execute(["help", "login"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: linear login \[options\]/);
  assert.match(result.stdout, /--api-key <value>/);
  assert.match(result.stdout, /--team <value>/);
});

test("login writes the repo-local config file", async () => {
  const writes = [];
  const fsImpl = {
    writeFileSync(filePath, contents, encoding) {
      writes.push({ filePath, contents, encoding });
    },
  };
  const repoRoot = process.cwd();
  const cwd = path.join(repoRoot, "tmp", "repro-login");

  const result = await execute(["login", "--api-key", "api", "--team", "REP"], {
    cwd,
    fsImpl,
    interactive: false,
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Saved Linear credentials to \.linear/);
  assert.deepEqual(writes, [
    {
      filePath: `${repoRoot}/.linear`,
      contents: "api_key=api\nteam=REP\n",
      encoding: "utf8",
    },
  ]);
});

test("login prompts for missing values when interactive", async () => {
  const prompts = [];
  const writes = [];
  const fsImpl = {
    writeFileSync(filePath, contents, encoding) {
      writes.push({ filePath, contents, encoding });
    },
  };
  const repoRoot = process.cwd();
  const promptCwd = path.join(repoRoot, "tmp", "repro-login-prompt");

  const result = await execute(["login", "--api-key", "api"], {
    cwd: promptCwd,
    fsImpl,
    interactive: true,
    prompt: async ({ field, message }) => {
      prompts.push({ field, message });
      return "REP";
    },
  });

  assert.equal(result.code, 0);
  assert.deepEqual(prompts, [{ field: "team", message: "Linear team: " }]);
  assert.deepEqual(writes, [
    {
      filePath: `${repoRoot}/.linear`,
      contents: "api_key=api\nteam=REP\n",
      encoding: "utf8",
    },
  ]);
});

test("auth-dependent commands suggest linear login", async () => {
  const fsImpl = {
    readFileSync() {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    },
  };

  const result = await execute(["issue", "list"], {
    env: {},
    cwd: path.join(process.cwd(), "tmp", "linear-no-config"),
    homeDir: path.join(process.cwd(), "tmp", "linear-no-home"),
    fsImpl,
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /linear login/i);
});

test("login fails clearly when run non-interactively without required values", async () => {
  const result = await execute(["login"], {
    interactive: false,
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /--api-key/i);
  assert.match(result.stderr, /--team/i);
  assert.match(result.stderr, /interactively/i);
});

test("issue help lists the new issue subcommands", async () => {
  const result = await execute(["help", "issue"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /create --title <title> --project <name>/);
  assert.match(result.stdout, /--related <issue-id>/);
  assert.match(result.stdout, /--blocks <issue-id>/);
  assert.match(result.stdout, /--blocked-by <issue-id>/);
  assert.match(result.stdout, /--parent <issue-id>/);
  assert.match(result.stdout, /--remove-parent/);
  assert.match(result.stdout, /children <id>/);
  assert.match(result.stdout, /start <id> \[--json\]/);
  assert.match(result.stdout, /update <id> \[options\]/);
  assert.match(result.stdout, /comment <id> <body>/);
  assert.match(result.stdout, /attach <id> --document <title>/);
  assert.match(result.stdout, /--remove-related <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-blocks <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-blocked-by <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-duplicate-of <issue-id> \(repeatable/);
});

test("document help lists the document subcommands", async () => {
  const result = await execute(["help", "document"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /document <subcommand>/);
  assert.match(result.stdout, /create --title <title> \[--issue <id>\]/);
  assert.match(result.stdout, /show <id-or-url>/);
  assert.match(result.stdout, /update <id-or-url> \[--title <title>\]/);
  assert.match(result.stdout, /link <url> --issue <id> \[--issue <id>\.\.\.\]/);
  assert.match(result.stdout, /issue attach <id> --document <title>/);
});

test("issue attach help points to document create", async () => {
  const result = await execute(["help", "issue", "attach"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /Compatibility command for issue-scoped documents\./,
  );
  assert.match(result.stdout, /Prefer linear document create --issue <id>\./);
});

test("issue create help advertises the parent flag", async () => {
  const result = await execute(["help", "issue", "create"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--parent <issue-id>/);
});

test("issue start help describes the self-start shortcut", async () => {
  const result = await execute(["help", "issue", "start"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /assign the issue to yourself/i);
  assert.match(result.stdout, /--json/);
});

test("label help lists the new label subcommands", async () => {
  const result = await execute(["help", "label"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /label <subcommand>/);
  assert.match(result.stdout, /create --name <name>/);
});

test("issue update help advertises field, relation, and removal flags", async () => {
  const result = await execute(["help", "issue", "update"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--add-label <name>/);
  assert.match(result.stdout, /--remove-label <name>/);
  assert.match(result.stdout, /--title <title>/);
  assert.match(result.stdout, /--parent <issue-id>/);
  assert.match(result.stdout, /--remove-parent/);
  assert.match(result.stdout, /--mine/);
  assert.match(result.stdout, /--related <issue-id>/);
  assert.match(result.stdout, /--blocks <issue-id>/);
  assert.match(result.stdout, /--blocked-by <issue-id>/);
  assert.match(result.stdout, /--duplicate-of <issue-id>/);
  assert.match(result.stdout, /--remove-related <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-blocks <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-blocked-by <issue-id> \(repeatable/);
  assert.match(result.stdout, /--remove-duplicate-of <issue-id> \(repeatable/);
  assert.match(result.stdout, /exact relation/i);
  assert.match(result.stdout, /relation ID/i);
});

test("version output remains available for bootstrap checks", async () => {
  const result = await execute(["--version"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^linear\s+1\.0\.0/m);
});

test("issue list help describes pagination and defaults", async () => {
  const result = await execute(["issue", "list", "--help"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--after <cursor>/);
  assert.match(result.stdout, /--leaf/);
  assert.match(result.stdout, /backlog.*todo/i);
});

test("whoami shows the viewer and configured team", async () => {
  const result = await execute(["whoami", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => makeClient(),
  });

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.item.viewer.name, "Test User");
  assert.equal(payload.item.team.key, "REP");
});

test("project list and milestone list keep SDK-style receivers bound", async () => {
  const records = {
    teams: [],
    projects: [],
    projectMilestones: [],
  };
  const client = makeBoundMethodClient(records);

  const projectList = await execute(["project", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });
  assert.equal(projectList.code, 0);
  const projects = JSON.parse(projectList.stdout);
  assert.equal(projects.items[0].name, "Workspace");
  assert.deepEqual(records.projects, [{ first: 200 }]);

  const bareMilestoneList = await execute(["milestone", "list", "--json"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory: async () => client,
  });
  assert.equal(bareMilestoneList.code, 0);
  const bareMilestones = JSON.parse(bareMilestoneList.stdout);
  assert.equal(bareMilestones.items[0].name, "Sprint 1");
  assert.deepEqual(bareMilestones.items[0].project, {
    id: "project-1",
    key: null,
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    updatedAt: null,
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      bareMilestones.items[0].project,
      "_request",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      bareMilestones.items[0].project,
      "projectMilestones",
    ),
    false,
  );

  const projectMilestoneList = await execute(
    ["milestone", "list", "--project", "Workspace", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );
  assert.equal(projectMilestoneList.code, 0);
  const projectMilestones = JSON.parse(projectMilestoneList.stdout);
  assert.equal(projectMilestones.items[0].name, "Sprint 1");
  assert.deepEqual(projectMilestones.items[0].project, {
    id: "project-1",
    key: null,
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    updatedAt: null,
  });

  const projectShow = await execute(
    ["project", "show", "Workspace", "--json"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory: async () => client,
    },
  );
  assert.equal(projectShow.code, 0);
  const projectShowPayload = JSON.parse(projectShow.stdout);
  assert.deepEqual(projectShowPayload.item.milestones[0].project, {
    id: "project-1",
    key: null,
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    updatedAt: null,
  });

  assert.deepEqual(records.projects[1], {
    filter: { name: { eqIgnoreCase: "Workspace" } },
    first: 20,
  });
  assert.deepEqual(records.projectMilestones, [
    { first: 200 },
    { first: 200 },
    { first: 200 },
  ]);
  assert.equal(records.milestoneProjectAccesses.length, 2);
});

test("validation rejects invalid priority, invalid limit, and assignee conflicts", async () => {
  const clientFactory = async () => makeClient();

  const badPriority = await execute(
    ["issue", "list", "--priority", "urgent-ish"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(badPriority.code, 2);
  assert.match(badPriority.stderr, /priority/i);

  const badLimit = await execute(["issue", "list", "--limit", "0"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory,
  });
  assert.equal(badLimit.code, 2);
  assert.match(badLimit.stderr, /limit/i);

  const tooLargeLimit = await execute(["issue", "list", "--limit", "251"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory,
  });
  assert.equal(tooLargeLimit.code, 2);
  assert.match(tooLargeLimit.stderr, /250/);

  const mineAndAssignee = await execute(
    ["issue", "list", "--mine", "--assignee", "test@example.com"],
    {
      env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
      clientFactory,
    },
  );
  assert.equal(mineAndAssignee.code, 2);
  assert.match(mineAndAssignee.stderr, /mutually exclusive/i);
});

test("issue update and comment validate required arguments", async () => {
  const clientFactory = async () => makeClient();

  const missingStatus = await execute(["issue", "update", "REP-875"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory,
  });
  assert.equal(missingStatus.code, 2);
  assert.match(missingStatus.stderr, /update fields/i);

  const missingBody = await execute(["issue", "comment", "REP-875"], {
    env: { LINEAR_API_KEY: "api", LINEAR_TEAM: "REP" },
    clientFactory,
  });
  assert.equal(missingBody.code, 2);
  assert.match(missingBody.stderr, /comment body/i);
});
