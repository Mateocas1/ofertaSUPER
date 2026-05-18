# Gate 6 - Career activation assets - 2026-05-18

Status: `GREEN`

The career-facing assets now point at the smoke-verified ofertasSUPER demo and the current GitHub repository, while keeping the claim boundary honest.

## Updated external assets

| Asset | Update |
|---|---|
| `CV_IT_Mateo_Vazquez_ATS_v2.md` | Project link line now uses `https://ofertas-super.vercel.app` and `https://github.com/Mateocas1/ofertaSUPER`. |
| `CV_IT_Mateo_Vazquez_ATS_v2.html` | HTML source mirrors the current project links. |
| `CV_IT_Mateo_Vazquez_ATS_v2.pdf` | Regenerated from the HTML and verified by PDF text extraction. |
| `LINKEDIN_GITHUB_UPDATE_PACK.md` | LinkedIn/GitHub project guidance now uses the current demo/repo and keeps `ofertasas` historical. |
| `APPLICATION_SNIPPETS.md` | Recruiter/application snippet now points at the current repo/demo. |
| `GITHUB_PROFILE_README.md` | GitHub profile README now highlights ofertasSUPER as the principal project. |

## Verification

- `node --test tests/portfolio.test.mjs tests/career-assets.test.mjs`: 20/20 passing (`2026-05-18-gate5-portfolio-career-tests.log`).
- PDF extraction: current demo/repo present; stale ofertasas demo/repo absent; no senior claim (`2026-05-18-gate6-cv-pdf-extraction.log`).
- Link/claim scan: active scanned career assets have no stale ofertasas demo/repo links (`2026-05-18-gate5-portfolio-link-claim-scan.log`).

## External publishing boundary

No new LinkedIn post, GitHub profile README repo update, pinned repo change, or external platform edit was performed in this gate. The assets are ready to paste/publish with user confirmation.

## Claim boundary

Allowed now: CV/LinkedIn/GitHub copy can say ofertasSUPER has a public smoke-verified demo and a current public repository.

Still forbidden: production-ready, formal IT work experience, seniority inflation, invented metrics, or active production ingestion/admin claims.
