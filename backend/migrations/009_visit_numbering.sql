-- total_visits: the contracted/expected number of visits for a job (e.g. an
-- annual maintenance contract with 30 scheduled visits) — nullable, an
-- admin sets it; visit codes just omit the "-{total}" segment if unset.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_visits INTEGER;

-- Ascending per job (job 4298's first visit is 1, its second is 2, ...),
-- computed when a visit (= a job_assignments row) is created.
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS visit_number INTEGER;
