import type { Vehicle, FreshnessState } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { getProductConfig } from "@/config/product";

export function computeFreshnessState(vehicle: Vehicle): FreshnessState {
  const { freshnessStaleDays } = getProductConfig();
  if (freshnessStaleDays == null) {
    return vehicle.freshnessState === "UNKNOWN" ? "UNKNOWN" : vehicle.freshnessState;
  }

  const reference =
    vehicle.lastAvailabilityConfirmedAt ?? vehicle.lastInventoryUpdate;
  const daysSince = differenceInDays(new Date(), reference);

  if (daysSince > freshnessStaleDays) {
    return "STALE";
  }
  if (vehicle.lastAvailabilityConfirmedAt) {
    return "FRESH";
  }
  return vehicle.freshnessState;
}

export function freshnessReferenceDate(vehicle: Vehicle): Date {
  return vehicle.lastAvailabilityConfirmedAt ?? vehicle.lastInventoryUpdate;
}
