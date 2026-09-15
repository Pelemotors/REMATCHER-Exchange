/**
 * Inventory Intake architecture (Field Test / Search-First)
 *
 * Happy Path:
 * WhatsApp → Share → OS Adapter → durable Intake ACK → dealer done
 * → processing → plate/GOV/text → VehicleCandidate(s) → auto-commit when confident
 * → Vehicle + mediaReady → Matching
 *
 * Candidate independence: one Candidate in NEEDS_REVIEW/FAILED does not block
 * other READY Candidates in the same Batch from committing.
 *
 * GOV is canonical only for official identity fields it provides.
 * Commercial fields (mileage, asking price, condition) come from share text /
 * dealer / vision with provenance — never silently overwritten by GOV.
 *
 * Media categories EXTERIOR/INTERIOR are classified automatically when confident;
 * dealer review only on real ambiguity. Readiness still requires both categories.
 */
export {};
