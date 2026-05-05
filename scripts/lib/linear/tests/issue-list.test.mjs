import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../cli.mjs";

export function makeClient(records) {
  records.viewerCalls ??= [];
  records.relationIssueAccesses ??= [];
  records.relationRelatedIssueAccesses ??= [];
  const project = {
    id: "project-1",
    name: "Workspace",
    url: "https://linear.app/acme/project/workspace",
    projectMilestones: async (vars) => {
      records.projectMilestones.push(vars);
      return {
        nodes: [
          {
            id: "milestone-1",
            name: "Sprint 1",
            targetDate: null,
            updatedAt: new Date("2026-04-18T00:00:00.000Z"),
            project: Promise.resolve(project),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
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
    project: Promise.resolve(project),
    projectMilestone: Promise.resolve({ id: "milestone-1", name: "Sprint 1" }),
    assignee: Promise.resolve({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
    }),
    state: Promise.resolve({
      id: "state-backlog",
      name: "Backlog",
      type: "backlog",
    }),
    comments: async (vars) => {
      records.comments.push(vars);
      return {
        nodes: [
          {
            id: "comment-1",
            body: "Looks good to me.",
            createdAt: new Date("2026-04-18T01:00:00.000Z"),
            updatedAt: new Date("2026-04-18T01:30:00.000Z"),
            author: Promise.resolve({
              id: "user-2",
              name: "Reviewer",
              email: "reviewer@example.com",
            }),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    relations: async (vars) => {
      records.relations.push(vars);
      return {
        nodes: [
          {
            id: "relation-blocks-1",
            type: "blocks",
            get issue() {
              records.relationIssueAccesses.push("relation-blocks-1");
              return Promise.resolve(issue);
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push("relation-blocks-1");
              return Promise.resolve({
                id: "issue-2",
                identifier: "REP-876",
                title: "Blocked issue",
                url: "https://linear.app/acme/issue/REP-876",
                state: Promise.resolve({
                  id: "state-todo",
                  name: "Todo",
                  type: "unstarted",
                }),
                assignee: Promise.resolve(null),
              });
            },
          },
          {
            id: "relation-related-out-1",
            type: "related",
            get issue() {
              records.relationIssueAccesses.push("relation-related-out-1");
              return Promise.resolve(issue);
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push(
                "relation-related-out-1",
              );
              return Promise.resolve({
                id: "issue-3",
                identifier: "REP-877",
                title: "Related issue",
                url: "https://linear.app/acme/issue/REP-877",
                state: Promise.resolve({
                  id: "state-done",
                  name: "Done",
                  type: "completed",
                }),
                assignee: Promise.resolve({
                  id: "user-3",
                  name: "Build User",
                  email: "build@example.com",
                }),
              });
            },
          },
          {
            id: "relation-duplicate-of-1",
            type: "duplicate",
            get issue() {
              records.relationIssueAccesses.push("relation-duplicate-of-1");
              return Promise.resolve(issue);
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push(
                "relation-duplicate-of-1",
              );
              return Promise.resolve({
                id: "issue-4",
                identifier: "REP-878",
                title: "Original issue",
                url: "https://linear.app/acme/issue/REP-878",
                state: Promise.resolve({
                  id: "state-todo",
                  name: "Todo",
                  type: "unstarted",
                }),
                assignee: Promise.resolve(null),
              });
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    inverseRelations: async (vars) => {
      records.inverseRelations.push(vars);
      return {
        nodes: [
          {
            id: "relation-blocked-by-1",
            type: "blocks",
            get issue() {
              records.relationIssueAccesses.push("relation-blocked-by-1");
              return Promise.resolve({
                id: "issue-5",
                identifier: "REP-879",
                title: "Blocking issue",
                url: "https://linear.app/acme/issue/REP-879",
                state: Promise.resolve({
                  id: "state-todo",
                  name: "Todo",
                  type: "unstarted",
                }),
                assignee: Promise.resolve({
                  id: "user-4",
                  name: "Planner",
                  email: "planner@example.com",
                }),
              });
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push(
                "relation-blocked-by-1",
              );
              return Promise.resolve(issue);
            },
          },
          {
            id: "relation-related-in-1",
            type: "related",
            get issue() {
              records.relationIssueAccesses.push("relation-related-in-1");
              return Promise.resolve({
                id: "issue-6",
                identifier: "REP-880",
                title: "Related incoming issue",
                url: "https://linear.app/acme/issue/REP-880",
                state: Promise.resolve({
                  id: "state-backlog",
                  name: "Backlog",
                  type: "backlog",
                }),
                assignee: Promise.resolve(null),
              });
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push(
                "relation-related-in-1",
              );
              return Promise.resolve(issue);
            },
          },
          {
            id: "relation-duplicate-in-1",
            type: "duplicate",
            get issue() {
              records.relationIssueAccesses.push("relation-duplicate-in-1");
              return Promise.resolve({
                id: "issue-7",
                identifier: "REP-881",
                title: "Duplicate issue",
                url: "https://linear.app/acme/issue/REP-881",
                state: Promise.resolve({
                  id: "state-done",
                  name: "Done",
                  type: "completed",
                }),
                assignee: Promise.resolve({
                  id: "user-5",
                  name: "Closer",
                  email: "closer@example.com",
                }),
              });
            },
            get relatedIssue() {
              records.relationRelatedIssueAccesses.push(
                "relation-duplicate-in-1",
              );
              return Promise.resolve(issue);
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
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
    labels: async (vars) => {
      records.labels.push(vars);
      return {
        nodes: [{ id: "label-1", name: "Feature" }],
      };
    },
    projects: async (vars) => {
      records.projects.push(vars);
      return { nodes: [project] };
    },
    issues: async (vars) => {
      records.issues.push(vars);
      return {
        nodes: [issue],
        pageInfo: { hasNextPage: true, endCursor: "abc123" },
      };
    },
  };

  return {
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
      return {
        nodes: [
          {
            id: "milestone-1",
            name: "Sprint 1",
            targetDate: null,
            updatedAt: new Date("2026-04-18T00:00:00.000Z"),
            project: Promise.resolve(project),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    issueLabel: async (id) => {
      records.issueLabels.push(id);
      return { id, name: "Feature" };
    },
  };
}

export function makeBoundMethodClient(records) {
  const team = {
    id: "team-1",
    key: "REP",
    name: "Workspace",
    states: async function (vars) {
      if (!this._request) throw new Error("unbound states method");
      records.states.push(vars);
      return {
        nodes: [
          { id: "state-backlog", name: "Backlog", type: "backlog" },
          { id: "state-todo", name: "Todo", type: "unstarted" },
        ],
      };
    },
    labels: async function (vars) {
      if (!this._request) throw new Error("unbound labels method");
      records.labels.push(vars);
      return { nodes: [] };
    },
    projects: async function (vars) {
      if (!this._request) throw new Error("unbound projects method");
      records.projects.push(vars);
      return { nodes: [] };
    },
    issues: async function (vars) {
      if (!this._request) throw new Error("unbound issues method");
      records.issues.push(vars);
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },
    _request: {},
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
    users: async function (vars) {
      if (!this._request) throw new Error("unbound users method");
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
    projectMilestones: async function (vars) {
      if (!this._request) throw new Error("unbound projectMilestones method");
      records.projectMilestones.push(vars);
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },
    issueLabel: async function (id) {
      if (!this._request) throw new Error("unbound issueLabel method");
      records.issueLabels.push(id);
      return { id, name: "Feature" };
    },
  };
}
