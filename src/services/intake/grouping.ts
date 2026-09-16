/**
 * Group IntakeBatch media into VehicleCandidate slots.
 * Re-exports discovery — a batch is not a vehicle.
 */
export {
  assignMediaToIdentityGroups,
  planCandidateSlots,
  formatIsraeliPlate,
  INTAKE_OCR_CONCURRENCY,
  type CandidateSlot,
  type DiscoveryGroup,
  type GroupingReason,
} from "@/services/intake/discovery";
