# Specification Template

Use this as a quick reference when creating new specifications.

## Quick Checklist

```bash
# 1. Create directory structure
mkdir -p specs/YYYY-MM-DD-<spec-name>/{docs,reference,examples}

# 2. Create core files
cd specs/YYYY-MM-DD-<spec-name>/
touch README.md 00-START-HERE.md DELIVERABLES.md
touch docs/{IMPLEMENTATION_GUIDE,ANALYSIS,DETAILED_PROPOSAL}.md docs/SUMMARY.txt
touch reference/{ARCHITECTURE,TROUBLESHOOTING}.md
touch examples/Example.improved
```

## File Templates

### 00-START-HERE.md (5-minute read)
```markdown
# START HERE: [Spec Title]

**Status**: [Draft/Complete/Ready]
**Impact**: [Describe main benefit]
**Effort**: [Time estimate]

## Problem (30 seconds)
[What's wrong?]

## Solution (30 seconds)
[How to fix it?]

## Quick Paths (Choose one)
1. Implementation: X minutes
2. Understanding: X minutes
3. Learning: X minutes

[See README.md for complete navigation]
```

### README.md (Navigation guide)
```markdown
# [Spec Title] Specification

**Date**: YYYY-MM-DD
**Status**: [Complete/Ready for Implementation]
**Impact**: [Key metrics and improvements]

## Quick Navigation

### For Implementation
→ `docs/IMPLEMENTATION_GUIDE.md`

### For Understanding
→ `docs/ANALYSIS.md`

### For Learning
→ `reference/ARCHITECTURE.md`

## Contents

- `docs/` - Implementation and analysis
- `reference/` - Learning and reference
- `examples/` - Code examples

[Add role-based reading paths]
```

### IMPLEMENTATION_GUIDE.md (Action-oriented)
```markdown
# Implementation Guide

## Phase 1: Critical (X minutes)

### Change 1: [Description]
**File**: path/to/file
**Before**: [code]
**After**: [code]
**Impact**: [benefit]

### Testing
[Test scenarios]

## Phase 2: Optimization (X minutes)
[Repeat above format]

## Phase 3: Advanced (X minutes, optional)
[Repeat above format]

## Verification Checklist
- [ ] All changes applied
- [ ] Tests pass
- [ ] Metrics improved
```

### ANALYSIS.md (Problem identification)
```markdown
# Analysis & Root Causes

## Issues Identified

### Issue 1: [Title]
**Current**: [How it works now]
**Problem**: [What's wrong]
**Impact**: [Consequences]
**Root Cause**: [Why it happens]

**Solution**: [How to fix it]

### Issue 2: ...

## Impact Analysis
[Metrics, scenarios, before/after]

## Recommendations
[Proposed solutions with details]
```

### SUMMARY.txt (Executive brief)
```
================================================================================
[SPEC TITLE] - Executive Summary
================================================================================

KEY FINDINGS:
- Finding 1
- Finding 2
- Finding 3

METRICS:
Before: X seconds / Y% / Z issues
After:  X seconds / Y% / Z issues
Improvement: XXx faster / YY% better

IMPLEMENTATION:
Phase 1: X minutes (80% benefit)
Phase 2: X minutes (95% benefit)
Phase 3: X minutes (100% benefit)

RISK: [Very Low/Low/Medium]
EFFORT: [Low/Medium/High]
VALUE: [High/Very High]

NEXT STEPS:
1. Read: README.md or 00-START-HERE.md
2. Implement: Follow docs/IMPLEMENTATION_GUIDE.md
3. Verify: Run test scenarios
4. Commit and document

================================================================================
```

### DELIVERABLES.md (Overview)
```markdown
# Deliverables

## What's Included

### Analysis Documents
- `docs/ANALYSIS.md` - Problem identification
- `docs/DETAILED_PROPOSAL.md` - Comprehensive recommendations
- `docs/SUMMARY.txt` - Executive summary

### Implementation Guides
- `docs/IMPLEMENTATION_GUIDE.md` - Step-by-step instructions
- `examples/` - Reference implementations

### Reference Materials
- `reference/ARCHITECTURE.md` - System design
- `reference/TROUBLESHOOTING.md` - Q&A and FAQ

## Document Statistics
- Total pages: X
- Total lines: X,XXX
- Code examples: X
- Scenarios analyzed: X

## How to Use This Spec

By Role:
- Managers: Read SUMMARY.txt + README.md
- Developers: Read IMPLEMENTATION_GUIDE.md
- DevOps: Read ARCHITECTURE.md + reference/
- New Members: Read 00-START-HERE.md → README.md

By Goal:
- Implementation: docs/IMPLEMENTATION_GUIDE.md
- Understanding: docs/ANALYSIS.md
- Learning: reference/ARCHITECTURE.md
- Quick Brief: SUMMARY.txt
```

### ARCHITECTURE.md (System design)
```markdown
# Architecture & Design

## System Overview
[Diagram or description of how the system works]

## Components
[List and explain key components]

## How It Works
[Step-by-step explanation of flow]

## Design Decisions
[Why things are designed this way]

## Future Improvements
[Opportunities for enhancement]
```

### TROUBLESHOOTING.md (FAQ & Reference)
```markdown
# Troubleshooting & FAQ

## Q: [Common question]
A: [Answer with details]

## Q: [Another question]
A: [Answer]

## Common Issues
[List issues and solutions]

## Reference
[Links to related documentation]
```

## Naming Conventions

- **Directory**: `YYYY-MM-DD-spec-name` (ISO date + kebab-case)
- **Files**: Clear descriptive names (IMPLEMENTATION_GUIDE.md, not guide.md)
- **Subdirs**: `docs/`, `reference/`, `examples/`
- **Code files**: Use `.improved` suffix (Tiltfile.improved, schema.improved)

## Directory Structure at a Glance

```
specs/YYYY-MM-DD-<spec-name>/
├── README.md                    # Navigation guide
├── 00-START-HERE.md            # Quick 5-min orientation
├── DELIVERABLES.md             # What's included
├── docs/                        # Analysis & implementation
│   ├── IMPLEMENTATION_GUIDE.md
│   ├── ANALYSIS.md
│   ├── DETAILED_PROPOSAL.md
│   └── SUMMARY.txt
├── reference/                   # Learning materials
│   ├── ARCHITECTURE.md
│   └── TROUBLESHOOTING.md
└── examples/                    # Code examples
    └── Example.improved
```

## When to Create a Spec

**DO Create When**:
- Conducting deep-dive analysis
- Designing architectural changes
- Creating implementation plans
- Documenting optimization strategies
- Proposing significant changes

**DON'T Create When**:
- Simple bug fixes
- Routine maintenance
- Quick patches
- Small feature additions

## Sharing a Spec

Share the spec's `README.md` with:
- Managers: Focus on SUMMARY.txt + KEY FINDINGS
- Developers: Focus on IMPLEMENTATION_GUIDE.md
- DevOps: Focus on ARCHITECTURE.md + reference/
- Team: Share top-level README.md for context

## Real Examples

- `specs/2026-02-09-tilt-sync-optimization/` - Docker sync optimization

Use this as reference when creating new specs.

---

**Last Updated**: 2026-02-09
**Pattern Version**: 1.0
**Status**: Formalized in AGENTS.md
