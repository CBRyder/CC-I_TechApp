-- Sticky, admin-set classification of which lifecycle a tech's visits
-- follow (see admin.js's visit status computation): a shop tech's visits
-- start "At the Shop" and finish as "Shop Return"; a road tech's start
-- "Incoming" and finish as "Completed". 'road' is the default since that's
-- the workflow this app was originally built around.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_type TEXT NOT NULL DEFAULT 'road';
ALTER TABLE users ADD CONSTRAINT users_tech_type_check CHECK (tech_type IN ('shop', 'road'));

-- The specific site under a job's customer/"umbrella" (e.g. customer_name
-- "Waste Management", location_name "Walmart") — distinct from the raw
-- street address. Admin-entered; nullable since it's not set on anything
-- existing yet.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_name TEXT;
