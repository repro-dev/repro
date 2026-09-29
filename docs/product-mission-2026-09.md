# Repro Product Mission and Roadmap

**Repository baseline: 25 September 2026 · refined through discussion: 27 September 2026**

**Status: working product direction and implementation sequence; open assumptions are called out below**

## Mission

Help the people who own bug feedback capture enough of what actually happened in a browser report that support can route it and engineering can prioritize and investigate it without long clarification loops.

Repro focuses on issue-shaped feedback: bugs, defects, and unexpected behavior. It is not a general feature-request, sentiment, or customer-feedback platform. Repro’s value is a high-quality report made by its own capture runtime. AI and agents may consume that evidence; they are not the product’s whole proposition.

The near-term outcome is **less time from report submission to meaningful triage**. A report is meaningfully triaged when it has a priority and accountable owner, with enough context to characterize it as a plausible issue and compare it with related reports where useful. It need not have a proven root cause or be freshly reproduced. Similarity suggestions can inform routing and investigation; duplicate closure remains an engineering decision.

## Product boundary and capture paths

```text
Capture a browser bug with Repro’s runtime
→ create a clear, evidence-backed report in Repro
→ support routes and prioritizes it
→ engineering investigates it and may pass the evidence to its own coding agent
```

- Repro recordings must come from Repro’s runtime. External links or ticket metadata may add context but are not Repro recordings and cannot replace Repro capture.
- **Extension first:** a staff member in support, product, design, or QA can report an issue without changing the team’s application code. This is the low-friction evaluation and internal-reporting path.
- **SDK fast follow:** after the extension release, build an app-integrated capture path with a Repro-provided end-user report UI. This captures issues in the customer’s actual browser session but requires the product team to integrate Repro.
- For embedded reporting, the working capture model is a team-enabled local rolling buffer, clearly disclosed to end users, with recording data uploaded only when a user submits a report. The required user input is a short description.
- The initial evidence priorities are timestamped interactions, console errors, and network activity. Finite Fetch/XHR request and response bodies are in scope for the Extension MVP. JSON object/array bodies receive the existing best-effort redaction; scalar JSON, non-JSON text, and binary bodies may remain unredacted. Fetch `text/event-stream` response bodies are omitted while status and headers are retained; the visible streamed UI is replayed through recorded DOM updates. Native `EventSource` and SSE message parsing are out of scope. WebSocket open/close/error lifecycle events remain available; inbound/outbound frame payloads are omitted by default. Capture behavior and unredacted payload types must be clearly disclosed before report upload.
- Repro supplies Repro-native evidence to a customer’s coding agent. The customer’s agent owns any attempt to reproduce the bug in its local or staging environment. Repro does not claim to execute, verify, or fix that attempt.
- Initial browser focus is Chrome and Chromium-based browsers such as Edge, with compatibility verified before support is claimed. Expand based on customer feedback and market share.

## Customer, buyer, and go-to-market hypothesis

**Initial company profile:** B2B SaaS teams that receive a meaningful volume of user reports about browser bugs, defects, and unexpected behavior.

- **First champion hypothesis:** support leads, because they own incoming feedback and can establish a support-tool foothold. The expected adoption path is support → engineering: support champions the workflow; engineering enables the SDK for customer capture and consumes the evidence.
- **Roles to test alongside support:** product managers, design leads, and QA leads. QA is included as a discovery cohort; do not assume its importance is declining without evidence.
- **Reporters:** internal staff on the extension path; the product’s end users on the SDK path.
- **Geography:** start with European teams because they are more reachable for founder-led outreach. This is a go-to-market choice, not a claim of EU/UK data residency or compliance value.
- **Acquisition:** founder-led organic outreach is the initial route. For this side project, finish a cohesive, demo-ready MVP cut first, then record demos and reach out one step at a time. No prospect quotas, deadlines, or parallel recruitment campaign are assumed.
- **Commercial objective:** a sustainable founder-operated business targeting approximately £250k+ ARR, with self-service evaluation, a small number of maintainable integrations, and low support effort per account. Dedicated account management is not the target operating model.

### Evidence and uncertainty

The founder’s firsthand experience at one engineering organization is that it receives **20+ low-quality browser bug reports per month**. Back-and-forth to make a report approachable can take hours to days; some ambiguous reports remain unapproachable in the backlog for weeks or months and contribute to SLA breaches. Some issues appear as separate reports because there is not enough detail to recognize their overlap. This is evidence that the problem exists in one organization, not validation of market-wide demand, a universal volume threshold, or the best buyer persona.

The core hypothesis is that better reports reduce the time to meaningful triage and help prevent ambiguous issues from being deprioritized. Customer demand for this workflow, the relative value by role, willingness to integrate the SDK, and willingness to pay remain unvalidated.

### Post-build organic pilot and learning loop

Begin external discovery after the founder considers the cohesive M1–M3 product cut ready to demonstrate. Use recorded demos and organic founder-led conversations; recruit sequentially as interest emerges. This is not a pre-build discovery gate or a parallel team campaign, and it carries no calendar deadline or prospect quota.

1. Start with people who may own browser-bug reports—support, product, design, or QA—and learn from the conversations without treating reply counts as demand validation.
2. Invite an interested team to try the Free end-to-end report workflow. Observe whether a support/QA advocate can bring reporters and an engineer into the same workspace, submit repeated real reports, and use a recording during debugging. Founder outreach can start the trial; independent self-propagating adoption is not a prerequisite for the first test.
3. Measure the baseline for report-to-triage time, first-review priority/ownership, and SLA aging where feasible. These observations do not have to improve for an extension pilot to count as a foothold. Keep the founder’s one-organization evidence distinct from pilot findings.
4. Map the teams’ existing support and engineering destinations. Design for reliable handoff early, but choose the first helpdesk connector from pilot evidence.
5. Verify browser support, production plan/entitlement values, capture/privacy behavior, retention enforcement, Linear behavior, and data-location claims before describing them as shipped capabilities.

These conversations inform role-specific messaging, the helpdesk choice, report UX, and SDK integration details. The SDK remains a committed fast follow after the Extension MVP; it is not a concurrent delivery obligation or an MVP gate.

## Product focus, not a moat

Repro does not need a winner-takes-all strategy or an invented “moat.” The focus is to reach B2B SaaS teams that have this reporting problem and are not already committed to another workflow, then serve them dependably. The initial reach hypothesis is to find teams not currently using Jam or an equivalent tool; the size and accessibility of that segment still need validation. Jam informs segment-specific table stakes and positioning; do not chase its entire feature list or assume Repro must displace its users.

The product focus is **high-quality browser bug intake that helps the team reach a meaningful triage decision sooner**. Repro’s own runtime, simple reporting, and useful technical context support that outcome. Within-project related-report suggestions and report-level trends are candidate extensions of the workflow, not claims of a strategic moat.

Jam’s public pages reviewed 25 September 2026 describe browser/iOS capture, instant replay, no-install Recording Links, browser context, automatic blur, Fin integration, and workflow automation. These establish competitive table stakes, not a feature checklist for Repro. See [Jam](https://jam.dev/) and [Jam webhooks documentation](https://jam.dev/docs/webhooks).

## Related-report suggestions

Repro may suggest similar reports **within the same project** to help support route a report and engineering seed an investigation.

- Combine multiple signals. Shared console-error signatures and matching failed-network metadata should carry the most weight; interaction/route similarity also matters; short-description similarity is the weakest signal.
- Favor precision: false matches can cause reports to be prematurely dismissed. Suggestions are advisory, explain the signals behind a match, and leave each report intact.
- Never automatically close, suppress, merge, or label a report as a duplicate. Engineering decides whether it is actually a duplicate.
- Do not search external ticket systems for the first version. A weighted similarity function is a product requirement to evaluate, not a commitment to embeddings or a particular algorithm.

## Current repository baseline

“Present in code” establishes implementation presence only; it does not establish production reliability, customer adoption, current configuration, or commercial value.

| Area | Verified in the repository | Partial, unverified, or absent |
|---|---|---|
| Extension/runtime | `apps/capture` is a Manifest V3 Chrome extension with minimum Chrome 111. Recording and playback packages cover browser events, including DOM, network, console, interactions, and browser metadata. | Chrome is verified by the manifest; Edge/other Chromium browser support still requires compatibility verification. |
| Upload and replay | Capture upload/progress, recording finalization, playback, timeline, and DevTools/inspection components exist. Share tokens can have an expiry. | No production completion/recovery SLO or first-value baseline was available in this repository. |
| SDK | `@repro/sdk` records custom marks and component state while the Repro extension is active. | It becomes a no-op without the extension; it is not the embedded customer-reporting runtime or report UI described above. The SDK path is new product work. |
| Workspace and handoff | Account/workspace and project membership, access checks, project settings, recording views, and Linear OAuth foundations exist. Recording deletion is implemented. | The end-to-end multi-discipline pilot workflow needs validation and workspace refinement. The project-management provider type currently contains only Linear; issue creation is not verified end to end, and no helpdesk connector was located. Select the first support integration with pilots. |
| Agent access | Agentic code and a capture-review assistant exist. Marketing describes MCP and coding-agent use. | The MCP server contract was not located in this repository scan. Verify or build the bounded, recording-scoped evidence interface before relying on it. The customer’s local/staging reproduction remains outside Repro’s execution boundary. |
| Privacy and retention | Privacy presets, redaction primitives, and per-recording privacy controls exist. Fetch/XHR body capture and playback display are implemented with a hard-coded 1,000,000-byte per-body cutoff. | JSON object/array HTTP bodies use existing best-effort redaction; scalar JSON, non-JSON, and binary payloads pass through unchanged. WebSocket frame payloads are captured with per-frame caps but no payload redaction or aggregate quota. See the transport review below. The settings copy says `.repro-mask` is planned but inactive in Standard mode. Capture review notes that per-recording overrides are sent with upload while event transforms remain follow-up work. Public Terms claim encryption and configurable/default-90-day retention; inspected application code did not establish end-to-end verification/enforcement. Ensure body-capture behavior is disclosed accurately; do not make stronger privacy or retention claims without evidence. |
| Analytics / report trends | Analytics plumbing and selected event tracking exist. A local ClickHouse discovery note proposes a derived analytics store. | The ClickHouse note is a proposal, not an implemented product capability or approval to build general observability. No production usage data or analytics export was available in this review. |
| Billing | Marketing currently lists Free, Growth at $29/user/month, and Scale as contact sales. Billing and entitlement code exist. | Marketing copy and sandbox plan configuration differ (including free recording limits and plan names); neither proves live production entitlements. Reconcile them before treating current prices or limits as fact. |
| European operations | Terraform provisions Scaleway and takes a deployment region through `SCW_REGION`, usually `fr-par`. | The live production region, full data flows, customer-selectable location, and compliance posture are not verified by the repository. |

Useful references: `apps/capture/src/extension/static/manifest.json`, `packages/recording`, `packages/playback`, `packages/sdk/README.md`, `apps/api-server/src/services/recordingFinalization.ts`, `apps/api-server/src/modules/database/schema/RecordingEventIndexTable.ts`, `apps/api-server/src/routers/project/recordings.ts`, `packages/domain/src/pmIntegrations.ts`, `apps/workspace/src/routes/RecordingPrivacySettingsRoute/RecordingPrivacySettingsRoute.tsx`, `apps/capture/src/components/Widget/CaptureReview/CaptureReview.tsx`, `apps/marketing/src/app/pricing/page.tsx`, `apps/marketing/src/app/terms/page.tsx`, and `terraform/README.md`.

### Network transport behavior and agreed MVP boundary

The current-behavior column describes the checked-in runtime; the MVP boundary records the agreed product decision.

| Transport | Current recording behavior | MVP decision |
|---|---|---|
| Finite Fetch/XHR | Request and response bodies are captured independently up to a hard-coded 1,000,000 bytes per body. Larger bodies become empty buffers. The Fetch response is cloned, read to completion with `arrayBuffer()`, and only then checked against the limit. | Keep bounded request/response bodies and the existing best-effort redaction for JSON objects/arrays. Scalar JSON, non-JSON text, and binary bodies may remain unchanged in the MVP; disclose that behavior. Broader handling is tracked in REP-1699. |
| Fetch streaming responses, including `text/event-stream` | The cloned response is accumulated until it closes; then the complete body is either kept or dropped. A long-lived stream can leave the response event pending while the clone accumulates data. | For `text/event-stream`, record response metadata promptly and omit the body without reading the stream. Do not parse SSE messages or add a stream timeline; playback shows the page's recorded DOM updates and explains why the network body is absent. |
| Native `EventSource` | The network observer wraps Fetch, XHR, and WebSocket, but not `EventSource`; it does not record SSE message data. | Keep native `EventSource` unobserved. Its visible application effects remain part of normal DOM recording/playback. |
| WebSocket | Open/close/error events and every inbound/outbound frame are captured. Each text frame is truncated at 65,536 JavaScript code units; each binary frame keeps up to 1,048,576 bytes. There is no payload redaction or aggregate frame quota. | Omit inbound/outbound frame-message events and payloads by default; retain connection lifecycle and error events. Revisit opt-in payload capture only if pilot evidence justifies its volume and privacy cost. |

Recordings use a 32,000,000-byte rolling event buffer, so WebSocket traffic cannot grow that buffer indefinitely; a busy socket can instead fill it quickly and evict earlier DOM, interaction, and network evidence. The agreed split is finite Fetch/XHR bodies, metadata-only handling of Fetch `text/event-stream`, no native `EventSource` capture, and WebSocket lifecycle events without frame payloads by default. Playback does not need an SSE event representation because the visible updates are recorded in the DOM timeline.

**Workspace adoption nuance:** the shared workspace is a core part of the product, not an afterthought. Existing account/project membership, access checks, project settings, and recording views provide a starting point, but the cross-discipline flow needs refinement. The extension pilot must show that a support advocate can bring in other reporters and a registered engineering teammate who joins the same workspace, opens a report recording, and uses it during a real debugging session.

## MVP definition and prioritization

**MVP Milestone 1 — Free Extension pilot:** let users create Free accounts through self-service signup and complete the report-to-investigation loop without integrating Repro into their application. A support advocate can invite at least two reporters and an engineer into the same workspace; a reporter submits repeat browser-bug reports with recordings; the advocate reviews and manually routes one; and the engineer opens and uses the same recording during a real debugging session. Finite Fetch/XHR bodies use the fixed policy below. Fetch `text/event-stream` bodies are omitted while visible page updates remain replayable. WebSocket lifecycle events are retained while frame payloads are omitted by default. Manual handoff to the team's existing support workflow is sufficient. Build and internally verify the cohesive MVP before organic external pilot outreach; account signup is not invitation-gated. M1 evidence is one part of the complete MVP validation, not a requirement to launch a prospecting campaign during development.

**MVP Milestone 2 — Self-serve billing and paid viability:** enable an eligible Free account to select a published paid plan, complete self-serve checkout, receive the correct subscription state and entitlements, and manage or cancel the subscription. Complete M2 only after the technical billing path passes production verification and at least one qualified target customer completes a real paid conversion. A test transaction proves system behavior, not willingness to pay. No manually provisioned paid plans or dedicated account management are part of the model.

**MVP Milestone 3 — Agentic diagnosis on workspace recordings:** design a workspace-only Agentic diagnosis/debugging flow for saved recordings from scratch, then test whether engineers find it useful and trustworthy during real debugging. Existing high-level Agentic UX, prompts, output contracts, and action flows are not foundations; only low-level tool definitions and turn-based streaming transport are candidates for reuse. The M3 design decides which capabilities are needed. Tier-specific usage limits remain undecided until there is product and cost evidence.

**Delivery acceptance:** the extension works in Chrome and any Chromium-based browser explicitly verified for support; reporters and engineers can access the same report and recording through workspace membership; existing JSON object/array body transformations happen before recording/upload, and capture of body formats that may remain unredacted is clearly disclosed; access behavior matches the verified product contract; upload/finalization failures are visible and recoverable. Internal technical readiness is separate from external adoption evidence, which begins after the cohesive MVP is demo-ready.

**Execution manifest:** `docs/extension-mvp-release-plan.md` assigns work to MVP Milestone 1 (Free pilot and extension Agentic removal), MVP Milestone 2 (self-serve billing and paid viability), MVP Milestone 3 (workspace Agentic diagnosis), conditional public distribution, or after-MVP work; it also defines the critical path and acceptance evidence. The lanes are filterable in Linear with `mvp-pilot`, `mvp-next-billing`, `mvp-m3-agentic`, `mvp-public-launch`, and `mvp-after-mvp`. REP-1700 gates M1; REP-1300/REP-1701 gate M2; REP-1703 validates M3.

**Committed fast follow — SDK:** begin the embedded end-user reporting path after the Extension MVP, according to available capacity. It is not part of these Extension MVP milestones and is not contingent on a positive extension-pilot result.

**Defer from the Extension MVP:** automated helpdesk integration, related-report suggestions, and report aggregation/trend dashboards. They may follow when pilot evidence supports them.

**Prioritization rule:** prioritize work that enables the complete extension report-to-investigation loop or satisfies its privacy, access, and recovery requirements. Defer work that does neither unless new customer evidence changes the priority.

## Roadmap horizons

### Post-build — Demonstrate, recruit organically, and establish the baseline

After the cohesive MVP cut is demo-ready, use recorded demos for organic founder-led outreach. The first objective is to find an interested team willing to try the real report-to-investigation workflow; continue one conversation or trial at a time. The three milestone hypotheses remain distinct: M1 tests the reporting workflow, M2 tests willingness to pay, and M3 tests workspace Agentic usefulness and trust during debugging. No calendar deadline or recruitment quota defines progress.

**Evidence:** record role-specific feedback, repeated real-report use where it occurs, whether an engineer uses a report recording during debugging, and material friction. Capture baseline observations for report-to-triage time and first-review priority/ownership where feasible, plus a verified list of product/privacy/browser claims. Keep founder outreach and onboarding context visible when interpreting results. A small or mixed sample remains directional; it does not prove broad demand or SDK customer-side capture value.

### Horizon 1A — Ship the extension-first reporting loop

Make the current Chrome extension the low-friction, no-app-change route for internal support, product, design, and QA reporters. Keep the first supported browser set deliberately narrow: Chrome first, then Chromium-based browsers such as Edge where tested. The report should capture the issue, present replayable Repro evidence, save into the Repro workspace, and let the team route it to an existing support workflow.

An evergreen Free tier can support evaluation and light use. Free should be useful, but not sufficient for a serious support operation. It must let multiple disciplines create their own workspace memberships and share reports, so an engineer can access and use a recording; the Free seat cap must be at least four internal members for the MVP’s advocate, two reporters, and engineer. A cap of up to 25 internal seats is a working hypothesis, subject to the eventual price and observed use. Define recording limits and any paid seat minimum through M2 packaging; decide workspace Agentic access and usage limits only after the M3 hypothesis test.

**Acceptance:** an internal reporter can capture and submit a useful report; a support advocate can review and route it; engineering can inspect the actual Repro recording; upload/finalization failures are visible and recoverable; privacy behavior matches the UI and verified tests. Establish numeric reliability targets after a baseline.

### MVP Milestone 2 — Self-serve billing and paid viability

M1 establishes the Free report workflow; M2 establishes self-serve plan selection, checkout, payment state, entitlement enforcement, and subscription management. Free-workflow observations can inform packaging and limits, while the initial single-plan price remains a low-friction hypothesis that can be iterated. M2 requires production billing verification and at least one qualified customer's real self-serve paid conversion. Do not manually assign paid plans or sell managed accounts. Keep Agentic diagnosis out of the extension after M1; workspace Agentic usage limits remain for M3 to test. Existing account/admin screens can remain available without a broad polish pass; paid actions become available when M2 is ready.

### MVP Milestone 3 — Agentic diagnosis on workspace recordings

M1 removes the current Agentic experience from the capture extension. M3 designs the workspace experience from scratch for engineers debugging from saved recordings. The current diagnosis UI, system prompt, response format, action flow, and extension integration are not accepted foundations; only low-level tool definitions and turn-based streaming transport are candidates for reuse. REP-1271 records the design in `repro.pen`, decides whether evidence presentation, uncertainty, continuation, persistence, teammate sharing, or coding-agent handoff belongs in M3, and sets the user-test protocol. Complete the Extension MVP only after M1, M2, and M3 have each met their acceptance criteria.

Test the designed hypothesis with engineers using real saved recordings. Record usefulness, trust, effect on their next debugging action, and material friction according to the protocol set before sessions begin. Do not claim validation without positive user evidence or claim Repro verifies a customer-side fix. Agentic tier access and usage quotas remain TBD pending M3 usage and cost evidence.

### Committed fast follow — Build the embedded SDK

Begin SDK work after the Extension MVP according to available capacity; do not make it contingent on a positive extension demand gate. It remains a committed fast follow, sequenced after the MVP rather than a concurrent obligation. The SDK path provides a Repro-owned in-app report surface for customer end users and a higher-fidelity view of the customer’s actual browser session, at the cost of a product-team integration.

Implement the working capture model: team enables the local rolling buffer, the product clearly informs the end user, and session evidence uploads only with the user’s report submission. Require a short description and attach the selected Repro-native evidence. Include Fetch/XHR bodies under the same size cap and current best-effort JSON object/array redaction as the extension path; other body formats may remain unredacted until REP-1699 is delivered. Keep typed UI values masked. Make actual behavior, retention, deletion, and user notice testable before rollout.

**Acceptance:** an end user can submit a report from the integrated product; the Repro workspace retains the user’s description and recording; support can route it; engineering can inspect the observed failure; no claim is made that the recording itself recreates the bug in a fresh session.

### Horizon 2 — Make reports easier to route and investigate

Keep Repro as the initial report intake workspace. Support-first automatic syndication to a helpdesk is the desired workflow; choose one helpdesk connector from pilot evidence. Prepare a stable report/recording contract early. Create or promote an engineering issue after support triage, rather than fanning every raw end-user report directly to engineering.

After enough Repro reports exist, test same-project related-report suggestions. Show the signals and preserve individual reports; support uses the suggestions for routing and engineers use them to seed investigation. Measure accepted and dismissed suggestions and prioritize precision over recall.

Coding agents may consume bounded, structured Repro evidence. Workspace Agentic diagnosis is introduced in M3; its Free/paid access and tier-specific usage limits remain open until M3 provides product and cost evidence. Agent model/provider usage through MCP is expected to be customer-owned; verify the actual interface and billing behavior.

### Horizon 3 — Grow paid value from Repro reports

Once the core report flow is established, consider paid aggregation, summaries, trend dashboards, and insights across **reports submitted to Repro**. Candidate views may help teams see repeated issues or report trends by project. This is report-workflow intelligence, not general application monitoring, APM, or a replacement for Sentry/Datadog.

Add configurable retention, access controls, auditability, or additional integrations only when customer pilots or lost deals show a concrete need and operational support is feasible. Expand capture environments based on customer feedback and market share.

## Commercial model and £250k ARR

**Working pricing direction:** evergreen Free with a candidate cap of 25 internal seats; M2 starts with exactly one paid self-serve offer, not a contact-sales tier. Price, billing unit, and any seat minimum remain open; optimize the initial offer for low-friction purchase evidence, even if it is deliberately underpriced, and iterate from real conversion data. The existing $29/user/month Growth offer is a reference point, not a decision. The Free cap must support the four-person pilot; recording limits are set through REP-1204 using pilot evidence. M3 tests workspace Agentic value; exact tier access and usage limits remain TBD. Advertise only entitlements available in the offer. The complete Extension MVP needs usage, paid-conversion, and Agentic-value evidence.

| Tier | Working intent |
|---|---|
| Free | Extension-led evaluation; candidate maximum of 25 internal seats, enough for reporting and engineering users to collaborate around reports; low report/recording allowance. Agentic diagnosis is workspace-only in M3; Free access and usage limits are TBD. No app-integrated SDK evaluation path. The 25-seat cap is provisional and should provide a manageable transition to paid while Free remains useful but insufficient for a serious team’s ongoing volume. |
| Paid | One self-serve offer at M2 launch. Final price, billing unit, and any seat minimum are open; start with a low-friction willingness-to-pay test and iterate. No contact-sales-only tier. Include only capabilities available at launch; M3 will test workspace Agentic value before deciding paid access or usage limits. |

The user’s own provider is expected to cover MCP model spend. Repro’s built-in workspace Agentic feature can have product/usage limits independent of MCP provider costs; specific tier limits remain TBD until M3 evidence. Do not over-design plan complexity before pilot data exists.

Recalculate the £250k ARR model after REP-1204 selects the paid billing unit, price, and any minimum. The prior five-seat-minimum arithmetic was illustrative only and is not a packaging commitment.

Separate packaging illustration—not a selected price or currency: if a team reaches a 25-seat Free cap and keeps those users on a paid plan at a hypothetical **$10 per seat/month**, that account would be **$250/month**. The cap is intended to avoid a much larger free-to-paid jump for an organization that has onboarded hundreds of users; actual pricing, discounts, procurement thresholds, and the right cap need validation.

## Success measures

Establish the baseline before setting targets. Track report lifecycle metadata only; do not send page contents or recording payloads to product analytics.

1. **Primary:** median and p90 time from report submission to meaningful triage—priority and accountable owner assigned, with enough information to characterize the report as a plausible bug.
2. **Next:** share of reports receiving priority and accountable owner at first review.
3. **Lagging:** SLA breach rate and age of issues initially blocked by ambiguous/missing report context.
4. **Core operation:** capture completion, upload/finalization success, incomplete reports, recovery, first useful report, advocate-led workspace signups across reporting and engineering, repeated reporting by multiple teammates, and engineering use of a recording during investigation.
5. **Commercial/solo operation:** pilot-to-paid conversion, paid accounts, MRR/ARR, retention, and founder support hours per account.

For related-report suggestions, measure whether support/engineering find them useful, false-match dismissals, and whether they help route or investigate. Similarity invocation alone is not success. Do not count a report as a duplicate solely because Repro suggested it.

## Open decisions to keep visible

1. Which of support, PM, design, and QA shows the strongest pilot willingness and organizational advocacy?
2. Which helpdesk should receive the first automatic support-case handoff?
3. Is SDK access in the same paid tier as the extension or tier-linked? Is a 25-seat Free cap appropriate at the eventual price, and what recording limits balance evaluation with serious-use conversion? What Agentic tier and usage limits are justified by M3 product and cost evidence?
4. What GBP seat price and report allowances support £250k ARR with the observed team sizes and support burden?
5. What exactly is the production MCP contract, and which tools belong in Free versus paid?
6. What retention, deletion, privacy, and browser-compatibility behavior can be verified end to end before being promised?
7. Which additional text and binary payload handling should follow the MVP's existing best-effort JSON object/array redaction (REP-1699)?
8. Should WebSocket payload opt-in ever be revisited based on pilot evidence?

**Planning rule:** keep the core product centered on high-quality Repro-native bug reports and faster meaningful triage. Build useful adjacent intelligence from those reports only after the reporting flow exists; do not invent a moat or expand into general observability.
