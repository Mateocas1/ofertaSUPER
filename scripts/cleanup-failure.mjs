export function retainCleanupFailure(primaryFailure, cleanupFailure, report = console.error) {
  if (!primaryFailure) return cleanupFailure;
  report("Cleanup also failed:", cleanupFailure);
  return primaryFailure;
}
