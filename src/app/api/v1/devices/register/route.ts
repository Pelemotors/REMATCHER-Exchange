/**
 * Alias path for Native clients that call POST /api/v1/devices/register.
 * Same handler as /api/v1/devices. Revoke intentionally NOT exposed.
 */
import { POST as registerDevice, dynamic as devicesDynamic } from "../route";

export const dynamic = devicesDynamic;
export const POST = registerDevice;
