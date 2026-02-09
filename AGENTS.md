# Agent Guidelines for Repro Codebase

## Build System
- Uses **moon** (monorepo task runner) with pnpm workspace
- Run tasks: `moon run <package>:build|test|typecheck` or `cd <package> && pnpm <script>`
- Build: `moon run <package>:build` (builds dependencies first via `^:build`)
- Test: `moon run <package>:test` or `pnpm test` (uses tsx with `--test` flag)
- Single test: `tsx --experimental-test-module-mocks --test path/to/file.test.ts`
- Typecheck: `moon run <package>:typecheck` or `pnpm typecheck`

## Code Style
- **Prettier**: `semi: false`, `singleQuote: true`, `arrowParens: avoid`, `trailingComma: es5`
- **Imports**: Use `prettier-plugin-organize-imports` (auto-sorts imports)
- **Types**: Strict TypeScript with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`
- **Paths**: Use `~/*` alias for local imports within packages
- **React**: Functional components with hooks, use `@jsxstyle/react` for styling
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Error handling**: Use `serialize-error` for serialization, `fluture` for async operations
- **NO COMMENTS**: Do not add code comments unless explicitly requested

## Conventions
- Packages: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- Use existing design system components from `@repro/design`

## Specifications & Investigations

When conducting investigations, deep-dives, or creating implementation plans, organize deliverables using the **specs pattern**:

### Directory Structure
```
specs/YYYY-MM-DD-<spec-name>/
├── README.md                    (Navigation guide & overview)
├── 00-START-HERE.md            (Quick orientation for all audiences)
├── DELIVERABLES.md             (What's included & how to use)
├── docs/                        (Core analysis & implementation guides)
│   ├── IMPLEMENTATION_GUIDE.md   (Step-by-step implementation)
│   ├── ANALYSIS.md              (Problem identification & root causes)
│   ├── DETAILED_PROPOSAL.md     (Comprehensive recommendations)
│   └── SUMMARY.txt              (Executive brief)
├── reference/                   (Learning materials & reference docs)
│   ├── ARCHITECTURE.md          (System architecture & design)
│   └── TROUBLESHOOTING.md       (Reference guide & FAQ)
└── examples/                    (Code examples & templates)
    └── Example.improved         (Reference implementation)
```

### Naming Convention
- **Directory**: `YYYY-MM-DD-<spec-name>` (ISO date + kebab-case)
  - Example: `2026-02-09-tilt-sync-optimization`
- **Files**: Clear, descriptive names (e.g., `IMPLEMENTATION_GUIDE.md`, not `guide.md`)
- **Subdirectories**: `docs/` (analysis/implementation), `reference/` (learning), `examples/` (code)

### Contents by Directory

**docs/**: Implementation and analysis documents
- `IMPLEMENTATION_GUIDE.md`: Step-by-step changes with code diffs, testing, rollback
- `ANALYSIS.md`: Problem identification, root causes, detailed explanations
- `DETAILED_PROPOSAL.md`: Comprehensive technical analysis with scenarios
- `SUMMARY.txt`: Executive summary (2-5 minute read)

**reference/**: Learning and reference materials
- `ARCHITECTURE.md`: System design, how it works, diagrams
- `TROUBLESHOOTING.md`: Q&A, common issues, reference material
- Related existing documentation links

**examples/**: Concrete code examples
- Complete, working examples showing improvements
- Comments explaining key changes
- Can be used as templates or reference implementations

**Root files**:
- `README.md`: Comprehensive navigation guide, role-based reading paths, document relationships
- `00-START-HERE.md`: Quick 5-minute orientation for all audiences, quick-start paths
- `DELIVERABLES.md`: Overview of what's included, statistics, how to use each document

### Content Guidelines

**README.md** (Navigation)
- Document index with descriptions
- Reading guide by role (Manager, Developer, DevOps, New Member, etc.)
- Quick metrics/findings summary
- File modification checklist
- Next steps & timeline

**00-START-HERE.md** (Quick Orientation)
- Problem statement (30 seconds)
- Solution overview (30 seconds)
- 3-4 quick-start paths with time estimates
- Document overview table
- Support/questions section

**IMPLEMENTATION_GUIDE.md** (Action-Oriented)
- Phase-by-phase instructions
- Before/after code diffs
- Testing procedures with specific test cases
- Rollback plan
- Verification checklist
- Expected performance baselines

**ANALYSIS.md / DETAILED_PROPOSAL.md** (Understanding)
- Problem explanation with examples
- Root cause analysis
- Detailed recommendations
- Impact analysis with scenarios
- Code examples

**SUMMARY.txt** (Executive Brief)
- Key findings (5 issues identified, etc.)
- Metrics (current vs. proposed)
- Implementation roadmap
- Effort estimate
- Risk assessment

**ARCHITECTURE.md / TROUBLESHOOTING.md** (Learning)
- System design and how it works
- Configuration details
- Common tasks and commands
- FAQ section
- Troubleshooting by symptom

**examples/** (Reference Code)
- Complete, ready-to-use implementations
- Comprehensive comments explaining changes
- Clear before/after comparisons
- Can serve as templates

### When to Create a Spec

Create a spec directory when:
- Conducting a deep-dive analysis or investigation
- Designing architectural changes or improvements
- Creating detailed implementation plans
- Documenting system optimization strategies
- Proposing significant codebase changes

Do NOT create a spec for:
- Simple bug fixes or minor changes
- Routine maintenance tasks
- Quick patches or hotfixes
- Small feature additions (use normal PR process)

### Organization Benefits

- ✓ All analysis materials centralized and discoverable
- ✓ Multiple entry points for different audiences
- ✓ Clear, role-based reading paths
- ✓ Easy to share with stakeholders/team
- ✓ Scalable pattern for future work
- ✓ Self-contained (can be archived, referenced, versioned)
- ✓ Professional presentation suitable for documentation

### Examples

**Existing spec**:
- `specs/2026-02-09-tilt-sync-optimization/` - Tilt Docker sync optimization

**Creating new specs**:
```bash
mkdir -p specs/2026-02-15-database-migration/{docs,reference,examples}
# Then populate with README.md, 00-START-HERE.md, DELIVERABLES.md, etc.
```
