# Category-pagination budget expansion evidence

Status: proposed for review  
Issue: [#316](https://github.com/Mateocas1/ofertaSUPER/issues/316)  
Scope: documentation only

## Conclusion

Category-pagination budget expansion stayed productive across all registered VTEX sources under bounded, read-only audits. Vea, Disco, Jumbo, and Carrefour followed the same progression: baseline repeat, wider categories, deeper pages, and offset sampling all produced useful yield with zero source errors. MAS required active sampling that excludes legacy `-old-` paths. DIA required offset sampling; later DIA offsets remained productive.

This evidence supports continued source-scoped budget planning. It does **not** prove full catalog coverage, scheduler readiness, all-source execution safety, discovery apply readiness, DB write safety, or production freshness.

## Evidence matrix

| Source | Rung | Issue | Sampling | Requests | Fetched rows | Denominator candidates | Duplicates | Errors | Read |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Vea | Baseline repeat | [#292](https://github.com/Mateocas1/ofertaSUPER/issues/292) | First slice, 10 categories, 3 pages | 31 / 40 | 300 | 245 | 55 | 0 | Stable repeat of #260. |
| Vea | Wider categories | [#293](https://github.com/Mateocas1/ofertaSUPER/issues/293) | First slice, 20 categories, 3 pages | 61 / 70 | 592 | 497 | 95 | 0 | Category widening doubled useful candidates. |
| Vea | Deeper pages | [#294](https://github.com/Mateocas1/ofertaSUPER/issues/294) | First slice, 20 categories, 5 pages | 99 / 110 | 972 | 813 | 159 | 0 | Page depth added substantial yield. |
| Vea | Offset sample | [#295](https://github.com/Mateocas1/ofertaSUPER/issues/295) | Offset 100, 20 categories, 5 pages | 87 / 110 | 832 | 732 | 100 | 0 | Later categories stayed productive. |
| Disco | Baseline repeat | [#296](https://github.com/Mateocas1/ofertaSUPER/issues/296) | First slice, 10 categories, 3 pages | 31 / 40 | 300 | 246 | 54 | 0 | Stable repeat of #265. |
| Disco | Wider categories | [#297](https://github.com/Mateocas1/ofertaSUPER/issues/297) | First slice, 20 categories, 3 pages | 61 / 70 | 592 | 497 | 95 | 0 | Matches the Vea expansion shape. |
| Disco | Deeper pages | [#298](https://github.com/Mateocas1/ofertaSUPER/issues/298) | First slice, 20 categories, 5 pages | 99 / 110 | 972 | 812 | 160 | 0 | Page depth remained productive. |
| Disco | Offset sample | [#299](https://github.com/Mateocas1/ofertaSUPER/issues/299) | Offset 100, 20 categories, 5 pages | 87 / 110 | 832 | 732 | 100 | 0 | Later categories stayed productive. |
| Jumbo | Baseline repeat | [#300](https://github.com/Mateocas1/ofertaSUPER/issues/300) | First slice, 10 categories, 3 pages | 31 / 40 | 300 | 248 | 52 | 0 | Minor live-data drift from #270. |
| Jumbo | Wider categories | [#301](https://github.com/Mateocas1/ofertaSUPER/issues/301) | First slice, 20 categories, 3 pages | 61 / 70 | 592 | 498 | 94 | 0 | Category widening doubled useful candidates. |
| Jumbo | Deeper pages | [#302](https://github.com/Mateocas1/ofertaSUPER/issues/302) | First slice, 20 categories, 5 pages | 97 / 110 | 942 | 783 | 159 | 0 | Total yield improved; per-request yield was slightly lower. |
| Jumbo | Offset sample | [#303](https://github.com/Mateocas1/ofertaSUPER/issues/303) | Offset 100, 20 categories, 5 pages | 85 / 110 | 806 | 706 | 100 | 0 | Later categories stayed productive. |
| MAS | Active baseline repeat | [#304](https://github.com/Mateocas1/ofertaSUPER/issues/304) | Exclude `-old-`, 10 categories, 3 pages | 25 / 40 | 215 | 154 | 61 | 0 | Stable repeat of #278 active sample. |
| MAS | Active wider categories | [#305](https://github.com/Mateocas1/ofertaSUPER/issues/305) | Exclude `-old-`, 20 categories, 3 pages | 46 / 70 | 386 | 281 | 105 | 0 | Active category widening improved yield. |
| MAS | Active deeper pages | [#306](https://github.com/Mateocas1/ofertaSUPER/issues/306) | Exclude `-old-`, 20 categories, 5 pages | 65 / 110 | 551 | 400 | 151 | 0 | Total yield improved; efficiency stayed roughly flat. |
| MAS | Active offset sample | [#307](https://github.com/Mateocas1/ofertaSUPER/issues/307) | Exclude `-old-`, offset 100, 20 categories, 5 pages | 44 / 110 | 308 | 198 | 110 | 0 | Later active slice produced useful but lower yield. |
| Carrefour | Baseline repeat | [#308](https://github.com/Mateocas1/ofertaSUPER/issues/308) | First slice, 10 categories, 3 pages | 30 / 40 | 282 | 219 | 63 | 0 | Minor live-data drift from #281. |
| Carrefour | Wider categories | [#309](https://github.com/Mateocas1/ofertaSUPER/issues/309) | First slice, 20 categories, 3 pages | 59 / 70 | 570 | 442 | 128 | 0 | Category widening doubled useful candidates. |
| Carrefour | Deeper pages | [#310](https://github.com/Mateocas1/ofertaSUPER/issues/310) | First slice, 20 categories, 5 pages | 95 / 110 | 930 | 715 | 215 | 0 | Page depth added strong total yield. |
| Carrefour | Offset sample | [#311](https://github.com/Mateocas1/ofertaSUPER/issues/311) | Offset 100, 20 categories, 5 pages | 88 / 110 | 834 | 711 | 123 | 0 | Later categories stayed highly productive. |
| DIA | Offset baseline repeat | [#312](https://github.com/Mateocas1/ofertaSUPER/issues/312) | Offset 50, 10 categories, 3 pages | 26 / 40 | 223 | 186 | 37 | 0 | Stable repeat of #287. |
| DIA | Offset wider categories | [#313](https://github.com/Mateocas1/ofertaSUPER/issues/313) | Offset 50, 20 categories, 3 pages | 48 / 70 | 405 | 328 | 77 | 0 | Category widening improved yield. |
| DIA | Offset deeper pages | [#314](https://github.com/Mateocas1/ofertaSUPER/issues/314) | Offset 50, 20 categories, 5 pages | 62 / 110 | 521 | 400 | 121 | 0 | Page depth improved yield modestly. |
| DIA | Later offset sample | [#315](https://github.com/Mateocas1/ofertaSUPER/issues/315) | Offset 150, 20 categories, 5 pages | 64 / 110 | 539 | 433 | 106 | 0 | Later offset slightly improved vs offset 50 deeper sample. |

## Source-specific conclusions

- **Vea, Disco, Jumbo, and Carrefour**: first-slice progression is consistently productive, and offset 100 samples show that productivity is not limited to the first category slice.
- **MAS**: useful evidence depends on excluding legacy `-old-` category paths. Active offset sampling remains productive, but lower-yield than the first active slice.
- **DIA**: useful evidence depends on offset sampling. Offset 50 repeats exactly; offset 150 produced slightly higher candidate yield than the offset-50 deeper-page run.

## What this does not prove

- Full public catalog exhaustion or complete internal supermarket catalog coverage.
- Scheduler execution, all-source execution, discovery apply, DB writes, production writes, deploys, migrations, cache purge, or production freshness.
- That category pagination alone is sufficient. Other public surfaces still need separate denominator and overlap analysis.
- That confidence should be `PASS`; these artifacts intentionally remain bounded, so confidence commonly stays `FAIL` due to category/page budgets.

## Recommended next step

Use this summary as the review baseline for the next planning decision: either continue source-scoped budget expansion with a larger bounded rung, or build comparison tooling that measures category-pagination candidates against current catalog identities before spending more live-request budget.
