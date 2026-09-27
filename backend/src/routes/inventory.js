const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../audit');

// Shop inventory — parts stock levels, sell prices, and supplier purchase
// orders. Open to admins and supervisors (a lead shop tech can run stock
// without holding full admin powers).
const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));

const PO_STATUSES = ['draft', 'ordered', 'received', 'cancelled'];

function poNumber(id) {
  return `PO-${String(id).padStart(5, '0')}`;
}

// Validates the editable part fields; returns { value } or { error }.
// `partial` allows leaving fields out (for edits).
function parsePartFields(body, { partial }) {
  const out = {};
  for (const key of ['category', 'name', 'unit']) {
    if (body[key] === undefined) {
      if (!partial && key !== 'unit') return { error: `${key} is required` };
      continue;
    }
    const v = String(body[key]).trim();
    if (!v) return { error: `${key} can't be blank` };
    out[key] = v;
  }
  if (body.sell_price !== undefined) {
    if (body.sell_price === null || body.sell_price === '') out.sell_price = null;
    else {
      const n = Number(body.sell_price);
      if (!Number.isFinite(n) || n < 0) return { error: 'sell_price must be a number ≥ 0' };
      out.sell_price = Math.round(n * 100) / 100;
    }
  }
  if (body.low_stock_level !== undefined) {
    if (body.low_stock_level === null || body.low_stock_level === '') out.low_stock_level = null;
    else {
      const n = Number(body.low_stock_level);
      if (!Number.isInteger(n) || n < 0) return { error: 'low_stock_level must be a whole number ≥ 0' };
      out.low_stock_level = n;
    }
  }
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) return { error: 'status must be active or inactive' };
    out.status = body.status;
  }
  return { value: out };
}

// qty on order = items on POs marked ordered but not yet received.
const PART_SELECT = `
  SELECT p.id, p.category, p.name, p.unit, p.status, p.sell_price, p.qty_on_hand, p.low_stock_level,
         COALESCE((
           SELECT SUM(poi.quantity) FROM purchase_order_items poi
           JOIN purchase_orders po ON po.id = poi.purchase_order_id
           WHERE poi.part_id = p.id AND po.status = 'ordered'
         ), 0)::int AS qty_on_order
  FROM parts_catalog p`;

function partRow(r) {
  return {
    ...r,
    sell_price: r.sell_price == null ? null : Number(r.sell_price),
    // Negative stock always counts as low — something was used that was
    // never counted in.
    is_low: r.qty_on_hand < 0 || (r.low_stock_level != null && r.qty_on_hand <= r.low_stock_level),
  };
}

// Applies a stock change inside an open transaction and logs it.
async function moveStock(client, { partId, change, reason, userId, note, purchaseOrderId, jobCompletionId }) {
  await client.query('UPDATE parts_catalog SET qty_on_hand = qty_on_hand + $1 WHERE id = $2', [change, partId]);
  await client.query(
    `INSERT INTO stock_movements (part_id, change, reason, purchase_order_id, job_completion_id, user_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [partId, change, reason, purchaseOrderId || null, jobCompletionId || null, userId || null, note || null]
  );
}

async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// Thrown inside a transaction to send a 4xx instead of a 500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

// ---------------------------------------------------------------- parts

router.get('/parts', async (req, res) => {
  try {
    const result = await pool.query(`${PART_SELECT} ORDER BY p.category, p.name`);
    res.json(result.rows.map(partRow));
  } catch (err) {
    sendError(res, err, 'Failed to load parts');
  }
});

router.get('/parts/:partId', async (req, res) => {
  const partId = Number(req.params.partId);
  try {
    const partResult = await pool.query(`${PART_SELECT} WHERE p.id = $1`, [partId]);
    if (!partResult.rows.length) return res.status(404).json({ error: 'Part not found' });

    const movements = await pool.query(
      `SELECT sm.id, sm.change, sm.reason, sm.note, sm.created_at, sm.purchase_order_id,
              sm.job_completion_id, u.full_name AS user_name, j.job_number
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN job_completions jc ON jc.id = sm.job_completion_id
       LEFT JOIN job_segments js ON js.id = jc.job_segment_id
       LEFT JOIN jobs j ON j.id = js.job_id
       WHERE sm.part_id = $1
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT 50`,
      [partId]
    );
    res.json({
      ...partRow(partResult.rows[0]),
      movements: movements.rows.map((m) => ({
        ...m,
        po_number: m.purchase_order_id ? poNumber(m.purchase_order_id) : null,
      })),
    });
  } catch (err) {
    sendError(res, err, 'Failed to load part');
  }
});

router.post('/parts', async (req, res) => {
  const parsed = parsePartFields(req.body, { partial: false });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const f = parsed.value;
  const startingQty = req.body.qty_on_hand == null || req.body.qty_on_hand === '' ? 0 : Number(req.body.qty_on_hand);
  if (!Number.isInteger(startingQty) || startingQty < 0) {
    return res.status(400).json({ error: 'Starting quantity must be a whole number ≥ 0' });
  }
  try {
    const part = await inTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO parts_catalog (category, name, unit, sell_price, low_stock_level)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [f.category, f.name, f.unit || 'each', f.sell_price ?? null, f.low_stock_level ?? null]
      );
      const id = result.rows[0].id;
      if (startingQty) {
        await moveStock(client, {
          partId: id,
          change: startingQty,
          reason: 'adjustment',
          userId: req.user.userId,
          note: 'Starting quantity',
        });
      }
      return (await client.query(`${PART_SELECT} WHERE p.id = $1`, [id])).rows[0];
    });
    await audit({ actorUserId: req.user.userId, action: 'part_created', resourceType: 'part', resourceId: part.id, ipAddress: req.ip, metadata: { name: part.name } });
    res.status(201).json(partRow(part));
  } catch (err) {
    sendError(res, err, 'Failed to create part');
  }
});

router.put('/parts/:partId', async (req, res) => {
  const partId = Number(req.params.partId);
  const parsed = parsePartFields(req.body, { partial: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const fields = Object.entries(parsed.value);
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const result = await pool.query(`UPDATE parts_catalog SET ${sets} WHERE id = $1 RETURNING id`, [
      partId,
      ...fields.map(([, v]) => v),
    ]);
    if (!result.rows.length) return res.status(404).json({ error: 'Part not found' });
    await audit({ actorUserId: req.user.userId, action: 'part_updated', resourceType: 'part', resourceId: partId, ipAddress: req.ip, metadata: parsed.value });
    const part = await pool.query(`${PART_SELECT} WHERE p.id = $1`, [partId]);
    res.json(partRow(part.rows[0]));
  } catch (err) {
    sendError(res, err, 'Failed to update part');
  }
});

// Either { change: +/-N } (received some, found a broken one, etc.) or
// { count: N } (a physical count — sets the balance, logs the difference).
router.post('/parts/:partId/adjust', async (req, res) => {
  const partId = Number(req.params.partId);
  const { change, count, note } = req.body;
  const hasChange = change !== undefined && change !== null && change !== '';
  const hasCount = count !== undefined && count !== null && count !== '';
  if (hasChange === hasCount) return res.status(400).json({ error: 'Send either change or count' });
  const n = Number(hasChange ? change : count);
  if (!Number.isInteger(n) || (hasCount && n < 0) || (hasChange && n === 0)) {
    return res.status(400).json({ error: hasCount ? 'Count must be a whole number ≥ 0' : 'Change must be a non-zero whole number' });
  }
  try {
    const part = await inTransaction(async (client) => {
      const current = await client.query('SELECT qty_on_hand FROM parts_catalog WHERE id = $1 FOR UPDATE', [partId]);
      if (!current.rows.length) throw new HttpError(404, 'Part not found');
      const delta = hasChange ? n : n - current.rows[0].qty_on_hand;
      if (delta !== 0) {
        const label = hasCount ? `Counted ${n}` : null;
        await moveStock(client, {
          partId,
          change: delta,
          reason: 'adjustment',
          userId: req.user.userId,
          note: [label, note && String(note).trim()].filter(Boolean).join(' · ') || null,
        });
      }
      return (await client.query(`${PART_SELECT} WHERE p.id = $1`, [partId])).rows[0];
    });
    res.json(partRow(part));
  } catch (err) {
    sendError(res, err, 'Failed to adjust stock');
  }
});

// ------------------------------------------------------ purchase orders

async function loadPurchaseOrder(db, id) {
  const poResult = await db.query(
    `SELECT po.*, cu.full_name AS created_by_name, ru.full_name AS received_by_name
     FROM purchase_orders po
     LEFT JOIN users cu ON cu.id = po.created_by
     LEFT JOIN users ru ON ru.id = po.received_by
     WHERE po.id = $1`,
    [id]
  );
  const po = poResult.rows[0];
  if (!po) return null;
  const items = await db.query(
    `SELECT poi.id, poi.part_id, poi.quantity, p.category, p.name, p.unit, p.sell_price, p.qty_on_hand
     FROM purchase_order_items poi
     JOIN parts_catalog p ON p.id = poi.part_id
     WHERE poi.purchase_order_id = $1
     ORDER BY p.category, p.name`,
    [id]
  );
  return {
    ...po,
    po_number: poNumber(po.id),
    items: items.rows.map((i) => ({ ...i, sell_price: i.sell_price == null ? null : Number(i.sell_price) })),
  };
}

// Validates { vendor, notes, items: [{ part_id, quantity }] }.
function parsePurchaseOrder(body) {
  const vendor = String(body.vendor || '').trim();
  if (!vendor) return { error: 'Vendor is required' };
  if (!Array.isArray(body.items) || !body.items.length) return { error: 'Add at least one part' };
  const items = new Map();
  for (const item of body.items) {
    const partId = Number(item.part_id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(partId) || partId <= 0) return { error: 'Invalid part' };
    if (!Number.isInteger(qty) || qty <= 0) return { error: 'Quantities must be whole numbers above 0' };
    items.set(partId, (items.get(partId) || 0) + qty);
  }
  return { value: { vendor, notes: String(body.notes || '').trim() || null, items: [...items] } };
}

async function writeItems(client, poId, items) {
  await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [poId]);
  for (const [partId, qty] of items) {
    await client.query(
      'INSERT INTO purchase_order_items (purchase_order_id, part_id, quantity) VALUES ($1, $2, $3)',
      [poId, partId, qty]
    );
  }
}

router.get('/purchase-orders', async (req, res) => {
  const { status } = req.query;
  if (status && !PO_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await pool.query(
      `SELECT po.id, po.vendor, po.status, po.created_at, po.ordered_at, po.received_at,
              COUNT(poi.id)::int AS item_count, COALESCE(SUM(poi.quantity), 0)::int AS total_quantity
       FROM purchase_orders po
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       WHERE ($1::text IS NULL OR po.status = $1)
       GROUP BY po.id
       ORDER BY po.created_at DESC
       LIMIT 200`,
      [status || null]
    );
    res.json(result.rows.map((r) => ({ ...r, po_number: poNumber(r.id) })));
  } catch (err) {
    sendError(res, err, 'Failed to load purchase orders');
  }
});

router.get('/purchase-orders/:poId', async (req, res) => {
  try {
    const po = await loadPurchaseOrder(pool, Number(req.params.poId));
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(po);
  } catch (err) {
    sendError(res, err, 'Failed to load purchase order');
  }
});

router.post('/purchase-orders', async (req, res) => {
  const parsed = parsePurchaseOrder(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { vendor, notes, items } = parsed.value;
  try {
    const po = await inTransaction(async (client) => {
      const result = await client.query(
        'INSERT INTO purchase_orders (vendor, notes, created_by) VALUES ($1, $2, $3) RETURNING id',
        [vendor, notes, req.user.userId]
      );
      await writeItems(client, result.rows[0].id, items);
      return loadPurchaseOrder(client, result.rows[0].id);
    });
    await audit({ actorUserId: req.user.userId, action: 'purchase_order_created', resourceType: 'purchase_order', resourceId: po.id, ipAddress: req.ip, metadata: { vendor } });
    res.status(201).json(po);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'One of those parts no longer exists' });
    sendError(res, err, 'Failed to create purchase order');
  }
});

// Only a draft can be edited — once it's been sent to the vendor, what was
// ordered is what was ordered.
router.put('/purchase-orders/:poId', async (req, res) => {
  const poId = Number(req.params.poId);
  const parsed = parsePurchaseOrder(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { vendor, notes, items } = parsed.value;
  try {
    const po = await inTransaction(async (client) => {
      const current = await client.query('SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId]);
      if (!current.rows.length) throw new HttpError(404, 'Purchase order not found');
      if (current.rows[0].status !== 'draft') throw new HttpError(409, 'Only a draft purchase order can be edited');
      await client.query('UPDATE purchase_orders SET vendor = $2, notes = $3 WHERE id = $1', [poId, vendor, notes]);
      await writeItems(client, poId, items);
      return loadPurchaseOrder(client, poId);
    });
    res.json(po);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'One of those parts no longer exists' });
    sendError(res, err, 'Failed to update purchase order');
  }
});

// Status changes: draft → ordered → received, or draft/ordered → cancelled.
// Receiving adds every line to stock.
const TRANSITIONS = {
  order: { from: ['draft'], to: 'ordered', stamp: 'ordered_at' },
  receive: { from: ['ordered'], to: 'received', stamp: 'received_at' },
  cancel: { from: ['draft', 'ordered'], to: 'cancelled', stamp: null },
};

router.post('/purchase-orders/:poId/:action(order|receive|cancel)', async (req, res) => {
  const poId = Number(req.params.poId);
  const t = TRANSITIONS[req.params.action];
  try {
    const po = await inTransaction(async (client) => {
      const current = await client.query('SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId]);
      if (!current.rows.length) throw new HttpError(404, 'Purchase order not found');
      const { status } = current.rows[0];
      if (!t.from.includes(status)) {
        throw new HttpError(409, `Can't ${req.params.action} a purchase order that is ${status}`);
      }

      await client.query(
        `UPDATE purchase_orders
         SET status = $2
             ${t.stamp ? `, ${t.stamp} = now()` : ''}
             ${t.to === 'received' ? ', received_by = $3' : ''}
         WHERE id = $1`,
        t.to === 'received' ? [poId, t.to, req.user.userId] : [poId, t.to]
      );

      if (t.to === 'received') {
        const items = await client.query(
          'SELECT part_id, quantity FROM purchase_order_items WHERE purchase_order_id = $1',
          [poId]
        );
        for (const item of items.rows) {
          await moveStock(client, {
            partId: item.part_id,
            change: item.quantity,
            reason: 'po_received',
            userId: req.user.userId,
            purchaseOrderId: poId,
          });
        }
      }
      return loadPurchaseOrder(client, poId);
    });
    await audit({ actorUserId: req.user.userId, action: `purchase_order_${t.to}`, resourceType: 'purchase_order', resourceId: poId, ipAddress: req.ip });
    res.json(po);
  } catch (err) {
    sendError(res, err, 'Failed to update purchase order');
  }
});

module.exports = router;
module.exports.moveStock = moveStock;
