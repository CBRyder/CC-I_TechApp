-- Explicit, admin-set override for whether a visit is treated as shop-
-- style or road-style — see admin.js's actsAsShopSql comment. Previously
-- this was purely inferred from the tech's tech_types + whether the visit
-- has a travel segment, which left no way for a dispatcher to say up front
-- which kind of visit this is for a tech who's both. NULL means "infer it
-- the old way" (still the default for a tech who's only ever one type).
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS visit_type TEXT;
ALTER TABLE job_assignments ADD CONSTRAINT job_assignments_visit_type_check
  CHECK (visit_type IS NULL OR visit_type IN ('shop', 'road'));
