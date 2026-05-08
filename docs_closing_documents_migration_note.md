# Closing Supporting Documents Migration Note

This feature requires the `closing_submission_documents` table before deployment.

## Apply migration
Run the standard migration flow used by this repository:

```bash
pnpm db:push
```

That flow executes `drizzle-kit generate && drizzle-kit migrate`, which consumes Drizzle migration metadata (`drizzle/meta/_journal.json`) and SQL files in `drizzle/`.

If your production deployment applies SQL manually, apply:

- `drizzle/0020_closing_submission_documents.sql`

before releasing this feature.

## Rollback note
This migration is additive only (new table + indexes). If rollback is required, you can stop using the feature and drop the new table manually after confirming no required data remains.
