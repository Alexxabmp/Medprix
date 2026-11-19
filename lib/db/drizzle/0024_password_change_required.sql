-- Temporary passwords (User Management, Part B). Set when an administrator creates an account or resets someone
-- else's password; the person must choose their own password at their next sign-in. Existing accounts are not affected.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
