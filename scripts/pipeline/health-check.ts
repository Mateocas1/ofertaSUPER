import { db } from "../../src/lib/db";
import { getSourceAdapter } from "../../src/lib/ingestion/adapters/registry";

export async function runHealthCheck(options: { slug: string; dryRun?: boolean }) {
  const adapter = getSourceAdapter(options.slug);
  const result = await adapter.healthCheck();

  if (!options.dryRun) {
    await db.sourceHealth.create({
      data: {
        source_slug: result.slug,
        is_healthy: result.isHealthy,
        response_time_ms: result.responseTimeMs,
        error_type: result.errorType,
        hash_valid: result.hashValid,
        products_returned: result.productsReturned,
      },
    });
  }

  return result;
}