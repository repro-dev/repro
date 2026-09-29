# Extension MVP release plan

**Planning basis:** `docs/product-mission-2026-09.md` and the agreed Extension-first, SDK-fast-follow direction.
**Release target:** a cohesive, demo-ready three-milestone Chrome MVP: Free report-to-investigation, one self-serve paid plan, and workspace-only Agentic diagnosis on saved recordings. Build and verify the product cut first; afterward, the founder can record demos and recruit organically, one step at a time. No recruitment deadlines, prospect quotas, or assigned outreach owners are part of this plan. Registration is not invitation-gated.
**Milestone 1 gate:** REP-1700. **Milestone 2 billing gates:** REP-1300 and REP-1701. **Milestone 3 Agentic gate:** REP-1703.

## MVP milestones

### Milestone 1 — Free pilot launch

The first launch is Free-only. A new user can self-register, create a project, and invite at least two reporters and one engineer; the Free plan supports all four collaborators without a paywall. A reporter submits two browser-bug reports with recordings; the advocate manually routes one; and the engineer opens and uses the same recording in a real debugging session. Capture, upload/finalization, recovery, privacy disclosures, and access are verified in production. Remove Agentic diagnosis from the capture extension in this milestone; keep the shared runtime and APIs available for its workspace delivery in M3.

REP-1700 is the production readiness gate for M1 only. A pass verifies the Free workflow with test accounts; it does not start external recruitment or mean the complete MVP has proven commercial viability. External outreach starts after the founder considers the cohesive MVP cut demo-ready.

### Milestone 2 — Self-serve billing and paid viability

M2 adds exactly one self-serve paid offer: an eligible Free account can select it, complete checkout, receive the correct subscription and entitlements from verified provider events, and manage or cancel the subscription. The initial price may be intentionally low to reduce purchase friction and test willingness to pay; pricing can be iterated from evidence. REP-1204 will finalize price, billing unit, and any seat minimum from M1 evidence. Do not advertise a contact-sales-only tier or manually provision paid accounts.

REP-1300 is the technical production smoke. M2 completion also requires real market evidence: at least one qualified target customer completes a self-serve paid conversion. A test transaction proves system behavior, not willingness to pay; REP-1292 records Free-pilot usage, and REP-1701 records paid-conversion evidence and pricing objections.

### Milestone 3 — Agentic diagnosis on workspace recordings

Design and build a workspace-only Agentic diagnosis/debugging experience for saved recordings from scratch. The existing diagnosis UI, prompts, output schema, action flow, and extension experience are not accepted foundations. Only low-level tool definitions and turn-based streaming transport are candidates for reuse. REP-1271 decides which interaction, evidence presentation, persistence, collaboration, handoff, and follow-up capabilities are needed. After the MVP is demo-ready, REP-1703 gathers directional evidence organically from 3–5 engineers across 2+ teams and at least 5 real debugging sessions, with no fixed study duration. Repeated usefulness/trust and debugging-action evidence across teams can support the hypothesis; sparse or conflicting evidence remains inconclusive.

M1 removes the Agentic entry point from the extension; M3 creates the saved-recording workspace experience. The M3 design and test protocol are prerequisites to committing its detailed interaction scope. Tier-specific Agentic usage limits remain TBD. Do not let an unapproved quota block the baseline M3 workflow; gather usage and cost evidence to inform packaging.

M1, M2, and M3 remain distinct readiness and evidence gates. All three are part of the MVP; public-distribution work remains a separate lane. The gates do not set calendar deadlines.

Basic account and admin screens may remain available. Their broad polish is not an MVP acceptance criterion; fix only issues that block the report workflow, mislead users about available billing, or create a material operational or data-loss risk. Keep paid checkout and subscription actions unavailable until M2 is production-ready, but do not hide Free signup or invitation acceptance.

### Fixed capture/privacy contract

- Finite Fetch/XHR request and response bodies remain in scope under the current 1,000,000-byte per-body ceiling. JSON object/array bodies receive the current best-effort redaction. Scalar JSON, non-JSON text, and binary bodies may remain unchanged and must be disclosed as such.
- Fetch `text/event-stream` keeps response metadata and omits the body without buffering it. Visible page updates remain in DOM playback; native `EventSource` and SSE parsing are out of scope.
- WebSocket open/close/error lifecycle events remain available; frame payloads are omitted by default.
- Framework state and storage capture remain off. Existing supported transformations must happen before data enters the recording stream or upload path.
- Do not claim that all captured data is sanitized. The technical disclosure and privacy notice must match verified behavior.

## Lane 1 — MVP Milestone 1: Free pilot

The technical release blockers in this lane must be done before REP-1700 can pass. Recruitment and real-use evidence are a later, founder-led step: begin only after the cohesive MVP cut is demo-ready, then use recorded demos and organic outreach without a prospect quota, due date, or owner-coordination plan. The signup path is Free and self-service; project invitations still provide shared team access.

**Linear filter label:** `mvp-pilot`.

### A. Policy, privacy, and user notice

| Issue | Priority | Pilot scope and completion evidence |
| --- | --- | --- |
| REP-1363 | Urgent | Finalize the in-browser capture policy for the fixed MVP contract above. No strict/balanced/debug mode project is required. Evidence: approved policy linked from the relevant capture/privacy issues. |
| REP-1275 | High | Set and explain the actual default masking/redaction behavior in capture and playback; no claim stronger than implementation. Evidence: default behavior and user-facing notice verified. |
| REP-787 | High | Verify request/response capture, the byte ceiling, JSON object/array transforms, unchanged unsupported formats, and transformation-before-recording/upload. Evidence: tests or explicit verification recorded in the issue. |
| REP-1350 | High | Ensure privacy treatment also applies to periodic DOM snapshots; framework-state data stays excluded while its gate is off. Evidence: snapshot tests cover the same policy as live events. |
| REP-1351 | High | Redact high-confidence email and payment-card patterns in DOM text at initial capture and live updates; defer global phone/national-ID heuristics. Evidence: tests include both capture paths and false-positive boundaries. |
| REP-1352 | High | Mask high-confidence sensitive form controls, especially card security values and standard payment autocomplete fields, in snapshots and live updates. Defer exhaustive international ID/banking heuristics. Evidence: field-type tests and non-sensitive control regression tests. |
| REP-1358 | High | Redact common non-standard authentication headers using the shared config, including Fetch/XHR and relevant handshake metadata. Evidence: header tests prove secrets are removed before events. |
| REP-1359 | High | Cover common sensitive console object keys without broad false-positive masking of benign `name` fields. Evidence: nested-object tests. |
| REP-1360 | High | Apply the shared high-confidence value patterns to console strings. Evidence: tests cover matching substrings and ordinary text. |
| REP-1361 | High | Apply the same supported policy to captured error messages and serialized errors. Evidence: `ErrorEvent` and rejection/error tests. |
| REP-1362 | High | Remove or redact sensitive attributes and labels from click-target snapshots while preserving structural evidence. Evidence: click metadata tests. |
| REP-721 | High | Prove framework-state recording emits nothing while disabled in the extension. Evidence: disabled-gate test; no app state enters periodic snapshots. |
| REP-1064 | High | Persist and apply the currently exposed per-recording privacy selectors consistently to snapshots and live updates, or remove/hide controls that do not work. Evidence: an end-to-end rule application test and recording metadata. |
| REP-1555 | High | Populate the override form from the effective workspace preset so the UI does not imply an empty policy. Evidence: preset/default and override behavior verified in capture UI. |
| REP-1696 | High | Record Fetch event-stream metadata promptly without consuming the stream; show an intentional-omission state in playback. Evidence: long-lived stream and normal page-consumption tests. |
| REP-1697 | High | Keep WebSocket lifecycle events and omit inbound/outbound frames by default without changing page traffic. Evidence: payload absence and lifecycle tests. |
| REP-1141 | High | Replace placeholder privacy copy with a policy consistent with actual collection, storage, retention, service providers, and user rights; obtain the required content review. Evidence: `/privacy` is complete and behavior-matched. |
| REP-1276 | High | Publish a concise pilot-facing recording/security explanation, including exactly what is captured, masking limits, retention/storage, and AI-provider flow where applicable. Evidence: a pilot user can reach it before recording/upload. |
| REP-553 | High | Link the policy/disclosure from pilot-relevant invite, capture, and workspace surfaces; public-site link coverage can be extended in the public-launch lane. Evidence: links are present and work in the pilot flow. |

### B. Recording reliability and capture quality

| Issue | Priority | Pilot scope and completion evidence |
| --- | --- | --- |
| REP-1412 | High | Install enabled runtime observers early enough to preserve initial browser-bug evidence without changing disabled-extension behavior. Evidence: document-start ordering test. |
| REP-1282 | High | Decide and finish only the finalization/indexing behavior required for saved recordings and diagnosis; explicitly defer analytics-only work. Evidence: golden path has no unresolved finalization dependency. |
| REP-593 | Urgent | Prevent partial object/database writes from appearing as complete recordings and document/rehearse recovery. Evidence: injected partial-failure tests and a recoverable user-visible state. |
| REP-1009 | Medium | Make recording/playback lifecycle tests deterministic so release verification does not hang. Evidence: smallest regression test and repeatable test run. |

### C. Production delivery and operations

| Issue | Priority | Pilot scope and completion evidence |
| --- | --- | --- |
| REP-648 | High | Provide the Terraform-managed staging and production resources required by the workspace/API/upload path. Evidence: reviewed plans and reachable required resources. |
| REP-649 | High | Deploy the required web/API path to staging for integration verification; admin/marketing deployment is not a pilot gate unless the deployed path requires it. Evidence: staging endpoints and deploy checks pass. |
| REP-1463 | Urgent | Apply the required infrastructure and populate deployment secrets from outputs. Evidence: Terraform apply and CI deployment credentials verified without committed secrets. |
| REP-877 | High | Configure and verify the static bucket secret needed by deployment jobs. Evidence: workspace deployment job succeeds. |
| REP-650 | High | Require human approval for production promotion and document rollback. Evidence: production deployment is protected and reversible. |
| REP-1278 | Urgent | Complete the production API deploy path, migrations, health check, routing, and rollback. Evidence: production API passes the pilot smoke. |
| REP-1279 | High | Verify production runtime OAuth, transactional email, object storage, and other required service credentials; keep Terraform/CI bootstrap in REP-1463. Evidence: each pilot path works and missing configuration fails clearly. |
| REP-1294 | Urgent | Deploy the workspace routes needed for Free signup/login, projects, project invitations, reports, and playback. Evidence: a fresh self-registered user and invited teammates can load and reload the production routes. |
| REP-1296 | Urgent | Deploy hosted capture assets and point the controlled pilot package at the correct production services. Evidence: an installed pilot build records and uploads successfully. |
| REP-1297 | High | Deploy only workers needed for invitation email and recording finalization; explicitly defer non-critical workers. Evidence: required worker health, retry, and failure signals are verified. |
| REP-1280 | High | Provide actionable logs/error reporting and a simple operator view/runbook for the pilot path. Evidence: a seeded failure is observable with enough context to diagnose. |
| REP-1281 | High | Document and test a minimum production database backup/restore path and owner. Evidence: restore rehearsal and runbook. |
| REP-651 | High | Build a traceable extension package and provide a reliable initial distribution/update path. Do not require Chrome Web Store publication for the MVP. Evidence: clean install/update and production recording smoke. |

### D. Onboarding, automated path, and pilot outcome

| Issue | Priority | Pilot scope and completion evidence |
| --- | --- | --- |
| REP-150 | High | Keep the minimal project invitation flow, seven-day expiry, acceptance into the same workspace, and shared-report access; account signup itself remains open. No broad member-management/roles expansion is required. Evidence: invitation flow tests and cross-user access check. |
| REP-1285 | High | Write the first-recording guide for the Free Chrome MVP: sign up, install, create/select a workspace/project, invite collaborators, submit a report, review privacy notice, play back, and manually hand off. SDK/recorder-node docs are excluded. Evidence: a new user completes it without founder onboarding. |
| REP-1269 | Urgent | Automate the repeatable Free signup → project setup/invitation → report/recording upload → listing/playback → second-user access path. The actual debugging session is manually evidenced through REP-1292. Evidence: reproducible test/runbook with step-level failures. |
| REP-1700 | Urgent | Run the production smoke with a fresh self-registered Free advocate and distinct reporter/engineer accounts; test project invitations, repeat report submissions, playback, and record build/environment/tester/pass-fail evidence. A pass authorizes M1 Free pilot launch only; REP-1292 measures real-team usage outcomes. |
| REP-1702 | High | Remove Agentic diagnosis from the capture extension while preserving report capture and saved recordings; retain shared Agentic runtime/API for M3. Evidence: extension has no Agentic UI/request path and the report golden path still passes. |
| REP-1287 | High | After the demo-ready MVP cut, identify a plausible first pilot team through organic founder-led outreach; no prospect-list size or outreach quota. |
| REP-1288 | High | Invite one interested cross-functional team to try the Free workflow after demo readiness. Use self-service signup and project invitations; no campaign, deadline, or dedicated account-management onboarding. |
| REP-1292 | High | When an organic pilot happens, record repeated report use and whether an engineer used a recording in real debugging, plus friction and follow-up decisions. No deadline, user-content analytics, or weekly dashboard. |
| REP-548 | Medium | Keep public Sign Up and Log In entry points connected to the workspace auth flow. Signup creates a Free account and does not preselect a paid plan or start checkout. Evidence: marketing CTAs reach the production Free registration and login routes. |

## Lane 2 — MVP Milestone 2: self-serve billing

**Linear filter label:** `mvp-next-billing`.

These issues establish paid viability in M2; M3 remains the final MVP milestone. Paid access is self-serve; dedicated account management is not part of the business model. Set one low-friction initial offer as a hypothesis, then iterate price and limits from organic user evidence. Verify plan selection, checkout success/cancel feedback, payment, entitlement enforcement, subscription management, and one real paid conversion without assigning a calendar deadline.

| Issue | Priority | M2 scope and completion evidence |
| --- | --- | --- |
| REP-1204 | Low | Define Free and exactly one paid self-serve offer; optimize the initial price for low-friction willingness-to-pay evidence, then iterate from observed use and conversion; keep Agentic limits open for M3. |
| REP-102 | High | Verify Paddle sandbox and production account readiness; refresh stale provider-version details in this legacy issue. |
| REP-470 | Medium | Configure production plan IDs and environment selection; verify live credentials/configuration are deployed safely. |
| REP-115 | Medium | Exercise checkout, provider events, plan changes, cancellation, payment failure, and idempotency against Paddle sandbox. |
| REP-121 | High | Publish public pricing for Free plus exactly one self-serve paid offer and the refund policy required for Paddle account approval; remove contact-sales-only offers. |
| REP-771 | Medium | Publish and link clear refund/cancellation terms in the checkout and billing paths. |
| REP-1641 | High | Make the workspace pricing page show Free plus the single paid M2 offer with visible price and usable self-serve selection; no contact-sales-only tier. |
| REP-133 | Medium | Show an optimistic success confirmation after successful Paddle checkout, and return cleanly to pricing after cancellation/error without claiming entitlements are active before the webhook. |
| REP-1642 | Medium | Correct Free-plan billing display/actions before self-serve billing is exposed. |
| REP-567 | Medium | Enforce plan entitlements at action boundaries; do not build dedicated account-management exceptions. |
| REP-1679 | Medium | Verify and complete authoritative Free-plan signaling before billing rollout. |
| REP-1300 | High | Run the technical production smoke for Free-to-paid conversion, checkout, webhooks, entitlements, billing management, and failure handling. |
| REP-1701 | High | Record at least one qualified customer's successful self-serve paid conversion; test transactions alone do not prove willingness to pay. |

## Lane 3 — MVP Milestone 3: Agentic diagnosis in the workspace

**Linear filter label:** `mvp-m3-agentic`.

This milestone moves diagnosis off the extension and into the saved-recording workspace flow. REP-1271 is the design gate: it defines the workspace flow from scratch, records its prototype in `repro.pen`, and decides whether optional capabilities below belong in M3. No existing high-level Agentic UX, prompt, diagnosis schema, or extension action flow is carried forward as a requirement.

| Issue | Priority | M3 scope and completion evidence |
| --- | --- | --- |
| REP-1271 | High | Fresh workspace flow design and `repro.pen` prototype; decide which diagnosis, evidence, persistence, collaboration, handoff, and follow-up behavior is needed; set the user-test protocol. |
| REP-1270 | High | Implement the approved workspace-only experience on saved recordings; blocked on REP-1271. |
| REP-1272 | Medium | Candidate coding-agent handoff; implement only if selected by REP-1271. |
| REP-703 | Medium | Candidate conversation persistence/sharing; implement only if selected by REP-1271 and enforce recording access. |
| REP-757 | Medium | Candidate recording-scoped persistence API; implement only if selected by REP-1271. |
| REP-758 | Medium | Candidate conversation restore/resume; implement only if selected by REP-1271. |
| REP-1592 | Medium | Candidate follow-up investigation action; implement only if selected by REP-1271. |
| REP-1703 | High | Test the fresh workspace flow with engineers using saved recordings; follow the pre-agreed protocol and record usefulness, trust, debugging impact, and open usage/cost questions. |

## Lane 4 — Conditional public distribution

**Linear filter label:** `mvp-public-launch`.

Free account signup remains available in the MVP. These later issues concern wider extension distribution and acquisition surfaces, not the availability of registration.

| Issue | Priority | Trigger and bounded scope |
| --- | --- | --- |
| REP-1277 | Medium | Complete Chrome Web Store submission/privacy packaging when store distribution is selected. |
| REP-1585 | Medium | Publish/optimize the Chrome Web Store acquisition listing after store submission is approved. |
| REP-547 | Medium | Build a dedicated public Chrome extension install page when broader acquisition begins. |

## Lane 5 — After MVP

**Linear filter label:** `mvp-after-mvp`.

| Issue | Priority | Reason to defer |
| --- | --- | --- |
| REP-608 | Low | Local Tilt/service URL configuration is not part of the deployed pilot path. Its existing In Review work can complete independently. |
| REP-1061 | Low | Block placeholders, broader input-masking hooks, and rrweb parity are not needed for the pilot if supported masks/defaults work and unsupported controls are hidden. |

## Superseded

| Issue | Status | Reason |
| --- | --- | --- |
| REP-710 | Duplicate | Superseded by the scoped policy issue REP-1363; retain its audit history and reference. |

## Critical path and dependencies

1. **Policy first:** REP-1363 → privacy implementation/defaults (REP-1275, REP-1350/1351/1352, REP-1358–1362, REP-721, REP-1064, REP-1555) → disclosure verification (REP-787, REP-1141/1276/553).
2. **Infrastructure and delivery:** REP-648 → REP-1463 → REP-877; REP-648 → REP-649 → REP-650; then production API/workspace/capture/workers (REP-1278/1294/1296/1297) and the controlled extension artifact (REP-651).
3. **Recording path:** REP-1282 → REP-593; complete stream/privacy handling (REP-1696/1697), then run REP-1269.
4. **Pilot cohort:** REP-1287 → REP-1288. After technical go/no-go in REP-1700, use REP-1292 to measure the actual team workflow and decide the next release cut.
5. **Paid viability:** use M1 evidence to finalize packaging (REP-1204); verify provider accounts, pricing/policies, production plan configuration, and sandbox behavior (REP-102/121/771/470/115/1641/133); finish Free-state correctness and entitlement enforcement (REP-1642/1679/567); pass REP-1300's production billing smoke; then use REP-1701 to record a real qualified-customer conversion.
6. **Workspace Agentic:** remove the extension entry point in M1 (REP-1702); complete fresh flow design (REP-1271); implement only the capabilities selected by that design (REP-1270/1272/703/757/758/1592); after the cohesive MVP is demo-ready, use REP-1703 to record real-engineer usefulness, trust, debugging impact, and usage/cost evidence organically, without a fixed study duration. Only low-level tool definitions and turn-based streaming transport are candidates for reuse; do not make tier-specific quotas a prerequisite.

Dependencies linked on the Linear issues are intended to be the execution graph; this document is the lane/scope/acceptance manifest. REP-1700 is blocked by M1 technical, privacy, release, and extension-removal issues. Recruitment and M1 pilot-outcome work are deliberately not technical smoke blockers. REP-1300 gates technical billing readiness; REP-1701 gates the M2 willingness-to-pay evidence; REP-1703 gates the M3 Agentic workflow and hypothesis test. REP-1300 is blocked by REP-1700 and then blocks REP-1701, keeping technical billing readiness ahead of paid-conversion evidence; canceled REP-1299 is no longer linked.

## Explicitly outside the three MVP milestones

- SDK fast follow remains committed and is not contingent on pilot success.
- Manual paid-account provisioning and dedicated account management are outside the business model.
- Agentic diagnosis in the capture extension is not a supported MVP surface; remove it in M1 and deliver the workspace-only version in M3.
- Exact tier-specific Agentic usage quotas are not yet decided; use M3 evidence before committing limits.
- Chrome Web Store publication and broad extension acquisition are separate from open Free signup and may follow the billing release.
- Broad account/admin UI redesign is not part of the gate. Keep existing surfaces unless a concrete flow, trust, or operational issue requires a targeted change.
- Helpdesk integration, automated routing, report similarity/aggregation, trend dashboards, native EventSource capture, Fetch SSE message parsing, WebSocket payload opt-in, storage capture, and framework-state capture.
- REP-1698/REP-1699 broader SSE/body work; REP-1696/REP-1697 provide the MVP transport boundaries.
