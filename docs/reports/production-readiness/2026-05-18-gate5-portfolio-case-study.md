# Gate 5 - Portfolio case study refresh - 2026-05-18

Status: `GREEN`

ofertasSUPER is now the lead project in the portfolio assets. This gate updated the static portfolio and proof-copy assets without touching the abandoned `ofertasas` project.

## Updated external assets

| Asset | Update |
|---|---|
| `portfolio/index.html` | Reordered projects to put ofertasSUPER first, restored the credentials rail, and repaired Spanish no-JS copy. |
| `portfolio/script.js` | Aligned Spanish/English translated project copy with the new project order. |
| `tests/portfolio.test.mjs` | Updated expected project order and kept design/no-mojibake checks. |
| `tests/career-assets.test.mjs` | Updated public proof expectations to `ofertas-super.vercel.app` and `Mateocas1/ofertaSUPER`. |
| `PORTFOLIO_RECRUITER_PROOF_PACK.md` | Updated current evidence and recruiter-safe answer for the live public demo. |
| `CURRENT_STATE_HANDOFF.md` | Updated active career handoff with 21/21 tests and Vercel public smoke evidence. |

External asset root: `C:/Users/picala/Documents/Codex/2026-05-07/files-mentioned-by-the-user-whatsapp`.

## Verification

- `node --test tests/portfolio.test.mjs tests/career-assets.test.mjs`: 20/20 passing (`2026-05-18-gate5-portfolio-career-tests.log`).
- Link/claim scan: no stale `ofertasas-web.vercel.app` or `github.com/Mateocas1/ofertasas` links in active scanned assets (`2026-05-18-gate5-portfolio-link-claim-scan.log`).
- Static tests cover Spanish default copy, English translations, project order, accessibility fallbacks, design-system classes, and mojibake prevention.

## Git note

The portfolio/CV folder is under git root `C:/Users/picala`, which has no commits and contains the broader user home as untracked files. I did not create commits from that root. The versioned evidence for this phase is recorded in this ofertasSUPER report.

## Claim boundary

Allowed now: portfolio assets can feature ofertasSUPER as the principal public project with live demo/repo links.

Still forbidden: production-ready, complete E2E coverage, active production ingestion, or production admin positive path fully validated.
