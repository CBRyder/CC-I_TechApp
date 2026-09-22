-- tech_type turned out not to be exclusive — a tech can be both shop and
-- road. Replace the single-value column with an array (simple enough not
-- to need a whole join table like user_roles).
ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_types TEXT[];
UPDATE users SET tech_types = ARRAY[tech_type]::TEXT[] WHERE tech_types IS NULL;
ALTER TABLE users ALTER COLUMN tech_types SET NOT NULL;
ALTER TABLE users ALTER COLUMN tech_types SET DEFAULT ARRAY['road']::TEXT[];
ALTER TABLE users ADD CONSTRAINT users_tech_types_check
  CHECK (tech_types <@ ARRAY['shop', 'road']::text[] AND cardinality(tech_types) > 0);
ALTER TABLE users DROP COLUMN tech_type;
