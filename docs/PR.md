## Summary

Migrates from MySQL to PostgreSQL. Removes frontend-only password update, front-end only username update 

Refactors `App.tsx` into a component/page structure, fixes local (non-Replit) `.env` loading for the db package, updates schema + docs, and resolves several bug fixes around phone number input, role persistence, and password UX.

## Changes

**Frontend structure**
- Split `App.tsx` into `components/custom-ui`, `pages/`, `lib/data.ts` (shared/mock data, route helpers), and `lib/types.ts`

**Environment loading**
- Added `dotenv` loading in `lib/db/src/index.ts` and `lib/db/src/drizzle.config.ts` so `DATABASE_URL` resolves correctly outside Replit (Replit's Secrets injected this automatically; local/VS Code dev did not have an equivalent)

**Schema**
- Renamed `users` table columns to match naming conventions used elsewhere in the schema
- Added missing `is_active` column (accounts had no way to be marked active/inactive)

**Docs**
- Removed the now-unnecessary manual `.env` loading step from the README (handled automatically as of the env-loading fix)
- Added seed instructions and migration instructions

**Bug fixes**
- Phone number input now enforces international format and rejects invalid characters
- Role changes now persist correctly: root cause was the missing `is_active` column silently dropping the write
- Password placeholder now accurately reflects the actual minimum length requirement
- Login modal password field now supports show/hide toggle

## Testing
- Verified `DATABASE_URL` resolves locally via VS Code without manually exporting env vars, and confirmed no change in behavior on Replit
- Verified role changes persist after the `is_active` migration
- Manually tested phone input against valid/invalid formats