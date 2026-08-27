# Complexity governance

The audit gates new complexity debt while allowing unchanged or reduced, inherited debt from a generated baseline. It measures ESLint core **cyclomatic complexity (10)** and SonarJS **cognitive complexity (15)**. Normal lint reports warnings; `npm run audit:complexity` is the merge gate.

## Quick path

1. Run `npm run audit:complexity` after changing production control flow.
2. Refactor any `new` or `regressed` record, or add one bounded central exception when the work cannot be split safely.
3. Run the test command named by the exception and remove the exception when its removal trigger occurs.

## What the audit analyzes

The audit analyzes `src/**/*.{js,jsx,ts,tsx}`, `scripts/**/*.{js,mjs,ts}`, `prisma/**/*.ts`, and executable root configuration/runtime modules matching `*.config.{js,mjs,ts}` (including `next.config.ts`). It excludes tests, generated output, dependencies, and artifacts.

A finding is identified by a stable typed, escaped semantic function symbol such as `src/lib/catalog.ts#function:loadCatalog/property:normalize`, not a line, column, source-order ordinal, or analyzer message. Named declarations, variables, properties, methods, and classes contribute typed hierarchy segments. Anonymous callbacks include their semantic call context and a normalized-content fingerprint, so removing an unrelated sibling or moving lines cannot transfer an identity. Duplicate semantic identities fail closed rather than being merged or relabeled. The standard ESLint analyzers provide the numeric metrics; the AST is used only to associate each report with that symbol.

## Baseline and exceptions

| File | Purpose |
| --- | --- |
| `config/complexity-baseline.json` | Generated snapshot of current over-threshold inherited debt, both measured values, and a structural fingerprint. It permits unchanged debt only when that fingerprint also matches, or any decreased debt. |
| `config/complexity-exceptions.json` | Authored, normally empty, approvals for a new or regressed exact function only. An unchanged baseline mirror is invalid, but a matching regression exception is permitted. |

An increase in either metric is a regression. A named function changed at equal metrics is also a regression when its structural fingerprint changes; decreased debt still passes. A new or regressed function fails unless an exception exactly matches its function id and current numeric values. The audit rejects duplicate, stale, unknown, expired, unbounded, understated, unchanged-baseline-mirror, or incomplete entries.

## Exception template

```json
{
  "functionId": "scripts/example.ts#reconcile",
  "owner": "team responsible for removal",
  "reviewer": "named independent reviewer",
  "measured": { "cyclomatic": 13, "cognitive": 17 },
  "ceilings": { "cyclomatic": 13, "cognitive": 17 },
  "rationale": "Why this function cannot safely be split now.",
  "proportionality": "Why this exact, bounded ceiling is the smallest exception.",
  "tests": ["tests/example.test.ts"],
  "testCommand": "npx tsx --conditions=react-server --test tests/example.test.ts",
  "expiresOn": "2027-01-01",
  "reviewTrigger": "Concrete event that requires review.",
  "removalTrigger": "Concrete extraction or redesign that removes the exception."
}
```

The linked test files must exist under `tests/`, use the `.test.ts` naming convention, and be sorted and unique. `testCommand` must exactly equal the shell-free canonical form `npx tsx --conditions=react-server --test <sorted linked test files>`; shell operators, extra paths, and unrelated commands are rejected. `expiresOn` is a future review deadline; review or removal is required earlier when either trigger occurs.

## Reading the report

The human report is sorted by function id and prints both metric values and one status per over-threshold function:

- `baseline`: inherited debt is unchanged or reduced.
- `exception`: a complete, exact, current bounded exception approved new or regressed debt.
- `new` / `regressed`: failing debt that needs refactoring or an exception.

It also prints metric and status totals. `npm run audit:complexity -- --json` emits the same sorted records as deterministic machine output. CI runs this audit in a separate no-secrets job for every pull request, including forks.
