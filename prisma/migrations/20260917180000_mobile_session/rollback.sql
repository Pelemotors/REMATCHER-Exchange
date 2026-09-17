-- Rollback for 20260917180000_mobile_session
-- Additive table only. Web NextAuth cookies are unaffected.
-- Restore path if needed: DROP TABLE then pg_restore from pre-migrate dump.

DROP TABLE IF EXISTS "MobileSession";
