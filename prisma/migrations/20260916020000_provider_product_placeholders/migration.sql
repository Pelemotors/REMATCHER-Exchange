-- Placeholder store product IDs (no prices). Replace with Owner App Store / Play IDs.
INSERT INTO "ProviderProduct" ("id", "planId", "provider", "externalProductId", "environment", "active", "createdAt", "updatedAt")
SELECT md5(random()::text || 'apple'), p."id", 'APPLE', 'co.rematcher.exchange.standard', 'SANDBOX', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SubscriptionPlan" p
WHERE p."slug" = 'exchange_standard'
  AND NOT EXISTS (
    SELECT 1 FROM "ProviderProduct" x
    WHERE x."planId" = p."id" AND x."provider" = 'APPLE'
  );

INSERT INTO "ProviderProduct" ("id", "planId", "provider", "externalProductId", "environment", "active", "createdAt", "updatedAt")
SELECT md5(random()::text || 'google'), p."id", 'GOOGLE', 'exchange_standard', 'SANDBOX', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SubscriptionPlan" p
WHERE p."slug" = 'exchange_standard'
  AND NOT EXISTS (
    SELECT 1 FROM "ProviderProduct" x
    WHERE x."planId" = p."id" AND x."provider" = 'GOOGLE'
  );
