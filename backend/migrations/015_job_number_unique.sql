-- job_number was never actually unique-constrained — fine while jobs only
-- came from a migration seed, not fine now that admins create them
-- through the app and could fat-finger a duplicate.
ALTER TABLE jobs ADD CONSTRAINT jobs_job_number_unique UNIQUE (job_number);
