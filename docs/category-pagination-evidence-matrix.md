# Category-pagination evidence matrix

Category-pagination is productive for every registered VTEX source reviewed here. Vea, Disco, Jumbo, and Carrefour produced useful rows from the first eligible category slice; MAS required excluding legacy `-old-` paths, and DIA required an offset sample. This is bounded, non-exhaustive evidence only: it supports budget-expansion planning, not full catalog coverage or any production write path.

## Evidence matrix

| Source | Preferred issue | Sampling method | Categories discovered | Requests | Fetched rows | Denominator candidates | Duplicates | Errors | Confidence / caveat |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Vea | [#260](https://github.com/Mateocas1/ofertaSUPER/issues/260) | Expanded first eligible category slice; preferred over initial mapping in [#258](https://github.com/Mateocas1/ofertaSUPER/issues/258). | 559 | 31 / 40 | 300 | 245 | 55 | Not summarized | Fail-closed by category/page budgets; bounded sample only. |
| Disco | [#265](https://github.com/Mateocas1/ofertaSUPER/issues/265) | First eligible category slice. | 559 | 31 / 40 | 300 | 246 | 54 | Not summarized | Fail-closed by category/page budgets; bounded sample only. |
| Jumbo | [#270](https://github.com/Mateocas1/ofertaSUPER/issues/270) | First eligible category slice. | 559 | 31 / 40 | 300 | 249 | 51 | Not summarized | Fail-closed by category/page budgets; bounded sample only. |
| MAS | [#278](https://github.com/Mateocas1/ofertaSUPER/issues/278) | Active sample excluding `-old-` paths; preferred over zero-product evidence in [#273](https://github.com/Mateocas1/ofertaSUPER/issues/273). | 3,022 total; 77 excluded; 2,945 eligible | 25 / 40 | 215 | 154 | 61 | Not summarized | Fail-closed by category/page budgets; productive only after source-specific path exclusion. |
| Carrefour | [#281](https://github.com/Mateocas1/ofertaSUPER/issues/281) | First eligible category slice. | 549 | 30 / 40 | 282 | 218 | Not summarized | 0 | Fail-closed by category/page budgets; bounded sample only. |
| DIA | [#287](https://github.com/Mateocas1/ofertaSUPER/issues/287) | Offset sample after low-utility first slice; preferred over zero-product evidence in [#284](https://github.com/Mateocas1/ofertaSUPER/issues/284). | 586 total; offset 50; 536 selectable | 26 / 40 | 223 | 186 | 37 | Not summarized | Fail-closed by category/page budgets; productive only after source-specific offset sampling. |

## Artifact and issue references

The preferred issue comments are the review source of truth for the posted evidence artifacts. The category-pagination audit tool writes artifacts under this bounded path shape:

| Source | Preferred artifact path |
| --- | --- |
| Vea | `audit/coverage/issue-260/vea/category-pagination/category-pagination-audit.json` |
| Disco | `audit/coverage/issue-265/disco/category-pagination/category-pagination-audit.json` |
| Jumbo | `audit/coverage/issue-270/jumbo/category-pagination/category-pagination-audit.json` |
| MAS | `audit/coverage/issue-278/mas/category-pagination/category-pagination-audit.json` |
| Carrefour | `audit/coverage/issue-281/carrefour/category-pagination/category-pagination-audit.json` |
| DIA | `audit/coverage/issue-287/dia/category-pagination/category-pagination-audit.json` |

Superseded or lower-utility evidence remains useful for lineage only: Vea [#258](https://github.com/Mateocas1/ofertaSUPER/issues/258), MAS [#273](https://github.com/Mateocas1/ofertaSUPER/issues/273), and DIA [#284](https://github.com/Mateocas1/ofertaSUPER/issues/284).

## What this does NOT prove

- Full catalog coverage or source exhaustion.
- Scheduler execution, all-source execution, discovery apply, manifest/prewrite generation, or active writer readiness.
- Database write behavior, production write safety, deploy readiness, migrations, cache purge, or production freshness.
- That first-slice sampling is enough for MAS or DIA; both required source-specific sampling to produce useful evidence.

## Recommended next steps

1. Choose a budget expansion strategy: increase category/page/request budgets per source while keeping the audit read-only and fail-closed.
2. Or build coverage comparison tooling that compares category-pagination candidates against current catalog identities before deciding whether broader pagination is worth the operational cost.
