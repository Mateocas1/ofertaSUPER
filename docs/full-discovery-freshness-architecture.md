# Full Discovery and Freshness Architecture RFC

Status: proposed for review  
Issue: [#241](https://github.com/Mateocas1/ofertaSUPER/issues/241)  
Scope: architecture/documentation only

## Executive decision

The target architecture is a source-scoped system that continuously measures the publicly observable catalog for each supported supermarket, discovers missing products through multiple public surfaces, refreshes known products by value and risk, and applies changes only through auditable, reversible gates.

Current Phase 2 bounded evidence is the correct foundation, but it is preparatory rather than final. It proves that small, controlled operations can fail closed, preserve rollback, and produce lineage-safe evidence. It does not yet prove full observable catalog coverage, sustained freshness, per-surface denominators, cost feasibility, or source-safe cadence.

The next slice should therefore be **CoverageAudit by source and surface**, before collecting more source evidence or increasing write scope. Without denominators, discovery can only prove isolated wins; with denominators, it can measure coverage, overlap, yield, and freshness debt.

## Definitions

| Term | Definition | Important limit |
| --- | --- | --- |
| Publicly observable catalog | Products exposed through public supermarket web surfaces that can be accessed without privileged credentials, internal APIs, evasion, or private data. | It is not the supermarket's internal SKU master. |
| Full discovery | Best-effort discovery of the publicly observable catalog across approved public surfaces, with measured coverage and known gaps. | It cannot guarantee 100% internal catalog coverage. |
| Freshness | The recency and correctness of price, availability, stock/offer state, and source metadata for a known source product. | It is budgeted by product class; not every product can be real-time. |
| Coverage denominator | The measured set of public product identities visible for a source/surface during a bounded audit window. | It can change over time and must carry timestamp and confidence. |

## Non-goals and impossibilities

This RFC does not authorize:

- DB writes, discovery apply, migrations, deploys, cache purge, scheduler execution, all-source execution, production writes, or live broad scans.
- Evasive scraping, captcha bypass, private/internal API use, credentialed supermarket access, or ToS-hostile behavior.
- A claim of complete internal supermarket catalog coverage.
- Unlimited real-time freshness for every product.
- Mixing discovery, refresh, apply, and audit into one implicit pipeline.

The realistic product claim is: **ofertasSUPER can pursue and measure high coverage of the public supermarket web catalog while keeping freshness targets explicit, budgeted, and source-safe.**

## Target architecture

| Layer | Responsibility | Output | Write boundary |
| --- | --- | --- | --- |
| Surface discovery audit | Enumerate public candidates by source and surface. | Coverage denominators, candidate identities, overlap/yield metrics. | Read-only. |
| Identity normalization | Deduplicate candidates into canonical source/product identities. | Canonical discovery keys and conflict flags. | Read-only. |
| Discovery planner | Select missing identities for reviewed creation. | Bounded discovery plan with evidence TTL and rollback preview. | Read-only/dry-run. |
| Refresh planner | Select known products by freshness priority. | Source-scoped refresh plan with budgets and stop rules. | Read-only/dry-run. |
| Apply gate | Mutate products/source rows/history only from fresh approved evidence. | Write report with exact created/updated IDs. | Write-capable, human-confirmed. |
| Postwrite audit | Prove exact effects and no extra rows. | PASS/FAIL audit and rollback references. | Read-only. |
| Observability | Track health, cost, yield, failures, freshness, and rollback readiness. | Dashboards/reports/alerts. | Read-only unless separately approved. |

The system remains source-scoped by default. Cross-source aggregation is a reporting concern, not an execution mode.

## Discovery surfaces

Each source should declare which public surfaces are approved, budgeted, and measured.

| Surface | Purpose | Strength | Risk / caveat |
| --- | --- | --- | --- |
| Category pagination | Primary catalog enumeration when product listing pages expose categories and pages. | Strong denominator candidate. | Pagination caps, hidden filters, duplicate tiles, anti-bot risk. |
| Sitemap/feed | Low-cost enumeration when public XML/JSON feeds exist. | Efficient, stable input. | May omit offers, variants, or unpublished products. |
| Search-term expansion | Finds products not reachable through stable category paths. | Useful for long tail and unknown categories. | Term bias; denominator is only as good as the term set. |
| Direct identity lookup | Verifies known SKU/EAN identities. | Strong for refresh and candidate confirmation. | Cannot discover unknown identities alone. |
| Historical recheck | Revisits products previously seen, missing, stale, or disappeared. | Protects against false removals and source drift. | Can preserve obsolete identities without verification policy. |
| Related/recommended products | Expands from public product detail recommendations. | Useful for adjacent long-tail discovery. | Biased graph; must be rate-limited and deduped. |

No single surface is sufficient. Full discovery is the union of approved surfaces, with overlap measured explicitly.

## Coverage model

### Denominator policy

Coverage must be measured per `source + surface + audit window` before claiming progress.

| Field | Requirement |
| --- | --- |
| Source | Supermarket slug and source configuration snapshot. |
| Surface | Category, sitemap/feed, search expansion, direct identity, historical recheck, or related/recommended. |
| Window | Audit start/end time, request budget, timeout, and stop condition. |
| Denominator | Count of normalized public candidate identities observed for that surface. |
| Confidence | PASS/WARN/FAIL plus reason: complete, capped, rate-limited, ambiguous, blocked, or sampled. |
| Lineage | Issue, commit, tool version, config hash, output path, and parent artifacts when applicable. |

### Dedup identity model

Candidates should normalize into a conservative identity record:

| Identity field | Role |
| --- | --- |
| `source` | Execution and ownership boundary. |
| `skuId` | Source-local product/SKU identity when exposed. |
| `ean` | Global product identity when reliable. |
| `productUrl` | Public URL evidence and host verification. |
| `canonicalKey` | Deterministic key derived from the strongest available fields, scoped by source when needed. |
| `surfaceKey` | Surface-specific origin key for overlap/yield analysis. |

Conflict policy: fail closed or mark ambiguous when SKU, EAN, URL, or normalized metadata disagree across surfaces. Discovery must not create rows from ambiguous identity.

### Metrics

| Metric | Meaning | Why it matters |
| --- | --- | --- |
| New products | Public candidates absent from current catalog/source rows. | Measures discovery opportunity. |
| Overlap rate | Same canonical identity seen on multiple surfaces. | Increases confidence and exposes duplicate work. |
| Stale rate | Known source products older than freshness target. | Measures refresh debt. |
| Missing/disappeared rate | Previously known identities no longer observed. | Drives verification before inactivation. |
| Error rate | Requests or normalization attempts that failed. | Protects against false denominator claims. |
| Surface yield | Unique valid candidates per request/time budget. | Guides where to spend discovery budget. |
| Apply eligibility rate | Candidates passing identity, quality, and safety gates. | Separates catalog opportunity from safe write readiness. |

## Freshness scheduler model

Freshness should be planned as prioritized queues, not one global scan.

| Queue | Selection rule | Cadence intent |
| --- | --- | --- |
| Hot offers | Products currently promoted, discounted, or offer-ranked. | Highest frequency within source budget. |
| Popular/high-value | Products with public demand, high price impact, or comparison value. | Frequent but budgeted. |
| Changed products | Recently changed price/availability or volatile categories. | Adaptive; shorter interval after changes. |
| Long tail | Low-change products with lower user impact. | Slow rotation to preserve baseline freshness. |
| Missing/disappeared | Products not observed in latest denominator or direct checks. | Verification queue before inactivation or hiding. |
| Retry | Transient failures, timeouts, 429/403, malformed responses. | Exponential backoff with source stop rules. |

Missing products must not be hidden, deleted, or inactivated from one denominator miss. A source-specific disappearance policy must require repeated misses or direct verification failure before changing product visibility/state.

Scheduler rules:

- Respect per-source request budgets, concurrency, timeout, and daily/hourly caps.
- Stop source on blocking, rate-limit, hash invalidation, host drift, repeated malformed data, or safety gate failure.
- Never compensate for low yield by silently switching to all-source or unbounded scans.
- Keep human-confirmed apply gates until unattended cadence has explicit approval, alerting, owner, ledger, and rollback posture.

## System boundaries

| Boundary | Must do | Must not do |
| --- | --- | --- |
| Discovery | Find and classify public missing identities. | Refresh known rows or write catalog rows directly. |
| Refresh | Update known source rows and price history from stable identity. | Create global/source product rows. |
| Apply | Perform approved writes from fresh prewrite evidence. | Select new scope, broaden source, or bypass confirmation. |
| Audit | Prove evidence, denominators, postwrite effects, and freshness. | Mutate production state. |

### Budgets and stop conditions

Every source/surface run must declare:

- request cap, concurrency, timeout, retry budget, and total attempt budget;
- allowed host and URL pattern;
- source kill switch and health precheck;
- artifact TTL and stale-evidence behavior;
- stop conditions for 403/429/captcha/HTML, hash invalid, host drift, identity mismatch, duplicate SKU/EAN conflict, non-positive price, and excessive error rate.

### Rollback and observability

Write-capable operations require:

- exact prewrite plan and human confirmation;
- transaction rechecks for source row, product row, staging conflicts, SKU/EAN identity, and locks;
- postwrite audit proving exact created/updated IDs and no extra rows;
- rollback plan bound to row IDs, not broad EAN deletes;
- stable run ID/idempotency key and safe replay behavior so rerunning the same approved plan cannot duplicate products, source rows, or history;
- run ledger, source lock, artifact lineage, owner, and alert path before repeated/cadence execution.

## Current approach: keep, refactor, remove

| Area | Decision | Rationale |
| --- | --- | --- |
| Controlled Phase 2 gates | Keep. | They prove safety, lineage, rollback, and fail-closed behavior. |
| Source-scoped direct identity lookup | Keep. | It is valuable for confirmation and refresh of known identities. |
| Discovery create prewrite/apply/postwrite separation | Keep. | It preserves reviewability and rollback. |
| Bounded evidence as final strategy | Refactor. | Bounded proofs must feed denominator/coverage metrics; they are not the final architecture. |
| Single-surface discovery assumptions | Refactor. | Full public coverage needs multiple surfaces and overlap analysis. |
| Freshness WARN as hard global stop | Refactor. | Freshness debt should trigger recovery planning when safety is PASS, not block all recovery. |
| Manual one-off scripts as operational memory | Refactor. | Repeated work needs ledger, budgets, owner, and observable state. |
| Any shortcut that mixes discovery create with refresh-existing | Remove/forbid. | It weakens no-create guarantees and rollback clarity. |
| Unbounded/all-source execution | Remove/forbid until separately approved. | It creates review, rate-limit, and rollback risk. |

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Legal/ToS | Source access or use may be disallowed or sensitive. | Review allowed-use posture per source before scale; avoid evasion and private APIs. |
| Blocking/rate limits | Denominator or freshness runs may degrade source access. | Conservative budgets, backoff, stop rules, source health, and no automatic escalation. |
| Cost | Requests, DB reads/writes, history growth, and review time can expand quickly. | Surface yield metrics, queue priority, caps, and index/retention planning. |
| Theoretical completeness | Public surfaces may not expose every internal product. | Use measured public denominators and explicit confidence, not 100% internal claims. |
| Operational complexity | More queues, artifacts, and gates can slow delivery. | Keep slices small, source-scoped, and reviewable; automate reporting before automating writes. |
| Identity ambiguity | Wrong SKU/EAN mapping can corrupt catalog quality. | Conservative dedup, direct verification, conflict flags, and fail-closed create gates. |
| Freshness aging | Manual batches may age faster than they recover. | Model windows and row throughput before cadence; prioritize high-value queues. |

## Concrete next slices

1. **CoverageAudit by surface**: implement a read-only artifact that measures `source + surface` denominators, identity overlap, yield, errors, and confidence. Start with one source and one surface, then add surfaces deliberately.
2. **Identity normalization report**: produce canonical keys and conflict classifications across surfaces without writing DB rows.
3. **Surface budget policy**: define per-source request caps, retry/backoff, timeout, stop conditions, and allowed-use posture before broader scans.
4. **Freshness queue planner**: rank existing known products into hot offers, popular/high-value, changed, long-tail, missing/disappeared, and retry queues using DB/audit evidence only.
5. **Apply eligibility bridge**: connect CoverageAudit candidates to existing discovery prewrite gates, preserving current create/apply/postwrite controls.
6. **Observability slice**: summarize coverage, freshness, yield, stale/missing/error rates, and blocked reasons for reviewer/operator consumption.

Do not increase write volume or run scheduler/all-source work until CoverageAudit and freshness queue planning make the denominator, budget, and risk visible.

## Review checklist

- [ ] The target claim is public observable catalog coverage, not internal supermarket completeness.
- [ ] Discovery surfaces are explicit and separately measurable.
- [ ] Coverage denominators and identity dedup are defined before broader evidence collection.
- [ ] Freshness uses prioritized queues and budgeted cadence, not unlimited real-time scans.
- [ ] Discovery, refresh, apply, and audit remain separate boundaries.
- [ ] Current Phase 2 gates are preserved as safety foundation, not mistaken for final coverage proof.
- [ ] The next slice starts with CoverageAudit by surface and remains read-only.
