/**
 * Identifiers for the 5 Autobot phase-specific agents.
 */
export type AutobotPhaseAgentId =
  | 'autobot-planner'
  | 'autobot-developer'
  | 'autobot-reviewer'
  | 'autobot-review-fixer'
  | 'autobot-publisher'

/**
 * A structured permission profile for an Autobot phase agent.
 */
export interface AutobotPhaseAgentPermission {
  /** The agent identifier. */
  agentId: AutobotPhaseAgentId

  /** Human-readable description of the agent's role. */
  description: string

  /** Whether the agent may read source files in the worktree. */
  read: boolean

  /** Whether the agent may write (create/modify) source files in the worktree. */
  write: boolean

  /** Whether the agent may use edit/patch tooling on source files. */
  edit: boolean

  /** Shell/command execution capability summary. */
  shell: string

  /** Whether the agent may use apply_patch tool. */
  patch: boolean

  /** Whether the agent may publish (push, PR, release, deploy). */
  publish: boolean

  /** GitHub operations the agent may perform. */
  github: string

  /** Linear operations the agent may perform. */
  linear: string
}

/**
 * Canonical permission profiles for all 5 Autobot phase agents.
 */
export const autobotPhaseAgentProfiles: Record<
  AutobotPhaseAgentId,
  AutobotPhaseAgentPermission
> = {
  'autobot-planner': {
    agentId: 'autobot-planner',
    description:
      'Read-oriented planning agent. Inspects issues, explores the codebase, and produces structured plan documents. Never writes source code.',
    read: true,
    write: false,
    edit: false,
    shell:
      'Deny all except git log*, git diff*, git show*, linear issue show*, linear issue children*, and read-only package discovery commands',
    patch: false,
    publish: false,
    github: 'Read-only: inspect diffs, view PRs, no mutations',
    linear:
      'Read-only: view issues, children, and metadata; no status mutations',
  },

  'autobot-developer': {
    agentId: 'autobot-developer',
    description:
      'Implementation agent. Writes source code, tests, and documentation in the issue worktree. Runs focused verification. Never pushes, creates PRs, or publishes.',
    read: true,
    write: true,
    edit: true,
    shell:
      'Full shell access for test/build/typecheck/format commands in the issue worktree',
    patch: true,
    publish: false,
    github:
      'Read-only: inspect diffs and status; no push, PR creation, or mutations',
    linear: 'Read-only: view issues; no status mutations',
  },

  'autobot-reviewer': {
    agentId: 'autobot-reviewer',
    description:
      'Read-only review agent. Inspects diffs, tests, and artifacts. Reports findings. Never modifies source code or branch state.',
    read: true,
    write: false,
    edit: false,
    shell: 'Deny all except git log*, git diff*, git show*, linear issue show*',
    patch: false,
    publish: false,
    github: 'Read-only: inspect diffs and PRs; no mutations',
    linear: 'Read-only: view issues; no status mutations',
  },

  'autobot-review-fixer': {
    agentId: 'autobot-review-fixer',
    description:
      'Review fix agent. Applies agent-fixable blocking fixes within the reviewed change set (bounded to 3 attempts) and handles the single-pass non-blocker sweep for mechanical fixes. Bounded to reviewed scope.',
    read: true,
    write: true,
    edit: true,
    shell:
      'Full shell access for verification commands in the issue worktree; no publish commands',
    patch: true,
    publish: false,
    github:
      'Read-only: inspect diffs; no push, PR creation, or mutations beyond the fix scope',
    linear: 'Read-only: view issues; no status mutations',
  },

  'autobot-publisher': {
    agentId: 'autobot-publisher',
    description:
      'Publish/release agent. Commits, pushes, creates PRs, and updates Linear status. Never writes or modifies source files.',
    read: false,
    write: false,
    edit: false,
    shell:
      'Allow only authorized git and gh commands for commit, push, and PR creation; deny all destructive git and arbitrary commands',
    patch: false,
    publish: true,
    github:
      'Push, PR creation, and branch management only on the prepared branch; no force-push, no merge, no release',
    linear:
      'Status mutations: update issue to In Review or other authorized states',
  },
}
