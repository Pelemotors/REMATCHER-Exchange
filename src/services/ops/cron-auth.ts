/**
 * Lifecycle cron authorization.
 * VPS: do not trust a client-supplied x-vercel-cron header.
 * Real Vercel: VERCEL_ENV is set by the platform.
 */

export type LifecycleAuthInput = {
  authorizationHeader: string | null;
  vercelCronHeader: string | null;
  lifecycleCatchupHeader: string | null;
  cronSecret: string | undefined;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  adminSession: boolean;
};

export function isLifecycleCatchUpAuthorized(input: LifecycleAuthInput): boolean {
  const secret = input.cronSecret?.trim();
  if (secret && input.authorizationHeader === `Bearer ${secret}`) {
    return true;
  }
  if (input.vercelEnv && input.vercelCronHeader) {
    return true;
  }
  if (
    input.nodeEnv !== "production" &&
    input.lifecycleCatchupHeader === "1"
  ) {
    return true;
  }
  return input.adminSession;
}
