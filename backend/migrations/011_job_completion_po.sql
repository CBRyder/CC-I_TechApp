-- Admin-assigned purchase order number for a completed visit — set after
-- the fact (billing/invoicing), never by the tech who did the work.
ALTER TABLE job_completions ADD COLUMN IF NOT EXISTS po_number TEXT;
