/** REMATCHER Event Contract — canonical event names */

export const PRODUCT_EVENTS = {
  DEMAND_CREATED: "demand_created",
  FIRST_MATCH_CREATED: "first_match_created",
  MATCH_CREATED: "match_created",
  MATCH_NOTIFIED: "match_notified",
  MATCH_OPENED: "match_opened",
  BUYER_INTERESTED: "buyer_interested",
  SELLER_INTERESTED: "seller_interested",
  MUTUAL_INTEREST: "mutual_interest",
  REVEAL_CREATED: "reveal_created",
  REVEAL_OPENED: "reveal_opened",
  OUTCOME_CREATED: "outcome_created",
  OUTCOME_UPDATED: "outcome_updated",
  DEAL_COMPLETED: "deal_completed",
  NOTIFICATION_READ: "notification_read",
} as const;

export const PUSH_EVENTS = {
  CREATED: "push_created",
  SEND_ATTEMPTED: "push_send_attempted",
  SENT: "push_sent",
  DELIVERY_FAILED: "push_delivery_failed",
  RECEIVED: "push_received",
  CLICKED: "push_clicked",
  DESTINATION_OPENED: "push_destination_opened",
} as const;

export const COMMERCIAL_EVENTS = {
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  IDENTITY_LINKED: "IDENTITY_LINKED",
  DEALER_VERIFIED: "DEALER_VERIFIED",
  DEVICE_REGISTERED: "DEVICE_REGISTERED",
  TRIAL_STARTED: "TRIAL_STARTED",
  TRIAL_EXPIRING: "TRIAL_EXPIRING",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
  PAYWALL_VIEWED: "PAYWALL_VIEWED",
  PURCHASE_STARTED: "PURCHASE_STARTED",
  PURCHASE_COMPLETED: "PURCHASE_COMPLETED",
  PURCHASE_FAILED: "PURCHASE_FAILED",
  SUBSCRIPTION_RENEWED: "SUBSCRIPTION_RENEWED",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
} as const;

export type ProductEventName =
  (typeof PRODUCT_EVENTS)[keyof typeof PRODUCT_EVENTS];
export type PushEventName = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS];
export type CommercialEventName =
  (typeof COMMERCIAL_EVENTS)[keyof typeof COMMERCIAL_EVENTS];


export function businessIdempotencyKey(
  eventType: string,
  entityType: string,
  entityId: string
): string {
  return `${eventType}:${entityType}:${entityId}`;
}

export function pushDeliveryIdempotencyKey(
  source: string,
  notificationId: string | null,
  subscriptionId: string | null,
  userId: string
): string {
  return `push:${source}:${notificationId ?? "none"}:${subscriptionId ?? "none"}:${userId}`;
}
