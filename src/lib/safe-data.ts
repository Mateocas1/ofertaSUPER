export async function withFallback<T>(promise: Promise<T>, fallback: T, onError?: (error: unknown) => void): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    onError?.(error);
    return fallback;
  }
}
