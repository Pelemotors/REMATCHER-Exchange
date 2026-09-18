/**
 * Alias path for Native clients that call POST /api/v1/devices/register.
 * Same handler as /api/v1/devices.
 * Owned revoke: POST /api/v1/devices/revoke (userId-scoped; no IDOR by token alone).
 */
import { POST as registerDevice } from "../route";

export const dynamic = "force-dynamic";
export const POST = registerDevice;
