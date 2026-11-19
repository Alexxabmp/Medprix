-- Login lockout (System Administration, Part D). Five wrong passwords within 15 minutes lock the account for
-- 15 minutes; a successful sign-in, a password reset or an administrator's Unlock clears it. Applies to every role.
ALTER TABLE users ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_failed_login_at timestamptz;
ALTER TABLE users ADD COLUMN locked_until timestamptz;
ALTER TABLE users ADD CONSTRAINT users_failed_login_count_check CHECK (failed_login_count >= 0);
