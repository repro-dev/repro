# Repro Specifications & Analysis

This directory contains technical specifications, deep-dives, and architectural analyses for Repro development infrastructure and systems.

## Contents

### 2026-02-09: Tilt Docker Sync Optimization

**Location**: `2026-02-09-tilt-sync-optimization/`

Complete analysis of the local development Tilt configuration, identifying performance bottlenecks in Docker file syncing.

**Status**: In Progress — `api-server` and `workspace` fully optimized; `admin` partially done (missing Dockerfile target, dependency graph integration, and app-specific sync paths)

**Key Findings**:
- 5 critical issues causing 3-10x slower feedback loop
- Solutions grouped into 3 implementation phases (5-60 minutes total)
- Expected improvements: 50-60% faster initial builds, 3-10x faster file syncs

**Quick Navigation**:
- 🎯 Implementation: `2026-02-09-tilt-sync-optimization/docs/IMPLEMENTATION_GUIDE.md`
- 📊 Analysis: `2026-02-09-tilt-sync-optimization/docs/SYNC_ANALYSIS.md`
- 📚 Learning: `2026-02-09-tilt-sync-optimization/reference/TILT_REFERENCE.md`
- 📖 Overview: `2026-02-09-tilt-sync-optimization/README.md`

**Effort**: 20 minutes for 95% benefit | 60 minutes for 100%

---

### 2026-02-17: Billing Implementation Plan

**Location**: `2026-02-17-billing-implementation-plan/`

Architecture and implementation plan for billing infrastructure — provider integration, subscription/entitlement data model, webhook processing, and feature gating.

**Status**: Complete & Ready for Implementation

**Key Areas**:
- Billing provider integration (checkout + portal)
- Subscription and entitlement data model
- Webhook processing pipeline
- Centralized entitlement service for feature gating

**Quick Navigation**:
- 🎯 Implementation: `2026-02-17-billing-implementation-plan/docs/IMPLEMENTATION_GUIDE.md`
- 📊 Analysis: `2026-02-17-billing-implementation-plan/docs/ANALYSIS.md`
- 📐 Architecture: `2026-02-17-billing-implementation-plan/reference/ARCHITECTURE.md`
- 📖 Overview: `2026-02-17-billing-implementation-plan/README.md`

---

## Adding New Specifications

When creating new specifications, use the directory structure:

```
specs/YYYY-MM-DD-<spec-name>/
├── README.md              (Overview & navigation)
├── DELIVERABLES.md        (What's included)
├── docs/                  (Analysis & implementation guides)
├── reference/             (Learning materials & references)
└── examples/              (Code examples & templates)
```

**Naming conventions**:
- Directory: `YYYY-MM-DD-spec-name` (ISO date + kebab-case)
- Documents: Clear, descriptive names (e.g., IMPLEMENTATION_GUIDE.md)
- Subdirectories: `docs/`, `reference/`, `examples/`

---

**Last Updated**: 2026-02-17
