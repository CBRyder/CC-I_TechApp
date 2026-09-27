-- Shop inventory: stock levels, sell prices, and supplier purchase orders,
-- managed by admins and the new 'supervisor' role (user_roles is free-text,
-- so the role itself needs no schema change — see VALID_ROLES in admin.js).

-- qty_on_hand is the running balance; every change to it also writes a
-- stock_movements row, so the balance can always be explained. It's allowed
-- to go negative (a tech logging a shop part before anyone counted it in)
-- rather than blocking the tech — the screen flags it instead.
ALTER TABLE parts_catalog ADD COLUMN IF NOT EXISTS sell_price NUMERIC(10, 2);
ALTER TABLE parts_catalog ADD COLUMN IF NOT EXISTS qty_on_hand INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parts_catalog ADD COLUMN IF NOT EXISTS low_stock_level INTEGER;

-- Only parts the tech marks "Shop part? Yes" come out of shop stock; the
-- rest were bought on the road or supplied by the customer.
ALTER TABLE job_completion_parts ADD COLUMN IF NOT EXISTS from_shop BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  vendor TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  part_id INTEGER NOT NULL REFERENCES parts_catalog(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (purchase_order_id, part_id)
);

-- Ledger of every stock change. reason:
--   adjustment  — manual +/- or a physical count (note says which)
--   po_received — a purchase order was marked received
--   job_used    — a "shop part" on a submitted job completion
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  part_id INTEGER NOT NULL REFERENCES parts_catalog(id),
  change INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('adjustment', 'po_received', 'job_used')),
  purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  job_completion_id INTEGER REFERENCES job_completions(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_part_idx ON stock_movements (part_id, created_at DESC);
