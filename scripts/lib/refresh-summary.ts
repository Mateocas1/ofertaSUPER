// Run-summary formatting for the daily refresh. Rejected products are part of
// a healthy run when they stay inside the tolerance, so the summary names them
// (and their quality flags) on one greppable line.

export type RejectedRecord = {
  batchId: string;
  gtin: string;
  qualityFlags: string[];
};

export const REJECTED_SUMMARY_PREFIX = "[refresh] rejected:";

export function formatRejectedSummary(rejected: RejectedRecord[]): string {
  return `${REJECTED_SUMMARY_PREFIX} ${rejected.length} products ${JSON.stringify(rejected)}`;
}
