/** Lightweight server-side API duration logging for production observability */

export async function withApiTiming<T>(
  label: string,
  fn: () => Promise<T>,
  thresholdMs = 500
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    if (duration >= thresholdMs) {
      console.info(`[api-slow] ${label} ${duration}ms`);
    }
  }
}
