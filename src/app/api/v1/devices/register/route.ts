/**
 * Alias path for Native clients that call POST /api/v1/devices/register.
 * Same handler as /api/v1/devices. Revoke intentionally NOT exposed.
 */
import { POST as registerDevice } from "../route";

export const dynamic = "force-dynamic";
export const POST = registerDevice;
