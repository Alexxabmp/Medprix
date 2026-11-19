-- Primary admin (User Management, Part A). Exactly one active Admin is the primary admin; only that account
-- may change other admin accounts or give someone the Administrator role. The oldest active admin starts as primary.
ALTER TABLE users ADD COLUMN is_primary_admin boolean NOT NULL DEFAULT false;
UPDATE users SET is_primary_admin = true
  WHERE id = (SELECT id FROM users WHERE role = 'Admin' AND is_active ORDER BY created_at, id LIMIT 1);
ALTER TABLE users ADD CONSTRAINT users_primary_admin_check
  CHECK (NOT is_primary_admin OR (role = 'Admin' AND is_active));
CREATE UNIQUE INDEX uq_users_single_primary_admin ON users (is_primary_admin) WHERE is_primary_admin;
