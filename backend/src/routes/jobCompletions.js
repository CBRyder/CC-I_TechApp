const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { getPresignedUploadUrl, getPresignedDownloadUrl } = require('../r2');
const { moveStock } = require('./inventory');

const router = express.Router();

// Upsert the completion record for a finished job segment. The time marker
// itself (job_segments.ended_at) is already recorded the instant Finish is
// tapped — this is the supplementary detail synced on its own schedule.
//
// On the submit itself, the device also sends its final `parts` list. The
// server makes its own copy match it exactly (parts removed on the device
// after they'd synced get dropped here — nothing else deletes them), then
// takes every "shop part" out of shop stock. That only happens on the
// unsubmitted → submitted transition, which can't happen twice, so a
// retried submit never double-deducts.
router.put('/sync', requireAuth, async (req, res) => {
  const { client_id, job_segment_client_id, visit_summary, submitted_at, parts } = req.body;

  if (!client_id || !job_segment_client_id) {
    return res.status(400).json({ error: 'client_id and job_segment_client_id are required' });
  }
  if (parts !== undefined && !Array.isArray(parts)) {
    return res.status(400).json({ error: 'parts must be an array' });
  }

  try {
    const segmentResult = await pool.query(
      `SELECT id FROM job_segments WHERE user_id = $1 AND client_id = $2`,
      [req.user.userId, job_segment_client_id]
    );
    if (segmentResult.rows.length === 0) {
      return res.status(409).json({ error: 'Parent job segment not synced yet' });
    }
    const jobSegmentId = segmentResult.rows[0].id;

    const existing = await pool.query(
      `SELECT id, visit_summary, submitted_at FROM job_completions WHERE user_id = $1 AND client_id = $2`,
      [req.user.userId, client_id]
    );
    if (existing.rows.length > 0 && existing.rows[0].submitted_at) {
      const row = existing.rows[0];
      const isIdenticalRetry =
        (visit_summary || null) === row.visit_summary && !!submitted_at;
      if (isIdenticalRetry) {
        return res.json({
          id: row.id,
          client_id,
          job_segment_id: jobSegmentId,
          visit_summary: row.visit_summary,
          submitted_at: row.submitted_at,
        });
      }
      return res.status(409).json({ error: 'This visit is already completed and can no longer be changed' });
    }

    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO job_completions (job_segment_id, user_id, client_id, visit_summary, submitted_at, synced_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, client_id) DO UPDATE
           SET visit_summary = EXCLUDED.visit_summary,
               submitted_at = EXCLUDED.submitted_at,
               synced_at = now()
         RETURNING id, client_id, job_segment_id, visit_summary, submitted_at, synced_at`,
        [jobSegmentId, req.user.userId, client_id, visit_summary || null, submitted_at || null]
      );
      row = result.rows[0];

      if (submitted_at) {
        if (parts) await reconcileParts(client, row.id, req.user.userId, parts);
        const shopParts = await client.query(
          `SELECT part_id, SUM(quantity)::int AS quantity
           FROM job_completion_parts
           WHERE job_completion_id = $1 AND from_shop
           GROUP BY part_id`,
          [row.id]
        );
        for (const part of shopParts.rows) {
          await moveStock(client, {
            partId: part.part_id,
            change: -part.quantity,
            reason: 'job_used',
            userId: req.user.userId,
            jobCompletionId: row.id,
          });
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      client.release();
    }
    res.json(row);
  } catch (err) {
    if (err instanceof PartsError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

class PartsError extends Error {}

// Makes the server's parts for a completion exactly match the device's
// final list (upsert what's there, delete what isn't).
async function reconcileParts(client, jobCompletionId, userId, parts) {
  const clientIds = [];
  for (const p of parts) {
    const qty = p.quantity == null ? 1 : Number(p.quantity);
    if (!p.client_id || !Number.isInteger(Number(p.part_id)) || !Number.isInteger(qty) || qty <= 0) {
      throw new PartsError('Each part needs client_id, part_id, and a whole-number quantity above 0');
    }
    clientIds.push(p.client_id);
    await client.query(
      `INSERT INTO job_completion_parts (job_completion_id, part_id, quantity, client_id, user_id, from_shop, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET quantity = EXCLUDED.quantity, from_shop = EXCLUDED.from_shop, synced_at = now()`,
      [jobCompletionId, Number(p.part_id), qty, p.client_id, userId, !!p.from_shop]
    );
  }
  await client.query(
    `DELETE FROM job_completion_parts
     WHERE job_completion_id = $1 AND NOT (client_id = ANY($2::text[]))`,
    [jobCompletionId, clientIds]
  );
}

// Upsert one "part used" line against a completion.
router.put('/parts/sync', requireAuth, async (req, res) => {
  const { client_id, job_completion_client_id, part_id, quantity, from_shop } = req.body;

  if (!client_id || !job_completion_client_id || !part_id) {
    return res
      .status(400)
      .json({ error: 'client_id, job_completion_client_id, and part_id are required' });
  }

  try {
    const completionResult = await pool.query(
      `SELECT id, submitted_at FROM job_completions WHERE user_id = $1 AND client_id = $2`,
      [req.user.userId, job_completion_client_id]
    );
    if (completionResult.rows.length === 0) {
      return res.status(409).json({ error: 'Parent job completion not synced yet' });
    }
    if (completionResult.rows[0].submitted_at) {
      return res.status(409).json({ error: 'This visit is already completed and can no longer be changed' });
    }
    const jobCompletionId = completionResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO job_completion_parts (job_completion_id, part_id, quantity, client_id, user_id, from_shop, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET quantity = EXCLUDED.quantity, from_shop = EXCLUDED.from_shop, synced_at = now()
       RETURNING id, client_id, part_id, quantity, from_shop, synced_at`,
      [jobCompletionId, part_id, quantity || 1, client_id, req.user.userId, !!from_shop]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Issue a presigned R2 upload URL for a before/after photo. The device
// uploads the JPEG directly to R2 (never through this server), then calls
// /photos/confirm once that upload actually succeeds.
router.post('/photos/presign', requireAuth, async (req, res) => {
  const { client_id, job_completion_client_id, kind, content_type = 'image/jpeg', byte_size, sha256 } = req.body;

  if (!client_id || !job_completion_client_id || !['before', 'after'].includes(kind)) {
    return res.status(400).json({
      error: 'client_id, job_completion_client_id, and kind (before|after) are required',
    });
  }

  try {
    const completionResult = await pool.query(
      `SELECT id, submitted_at FROM job_completions WHERE user_id = $1 AND client_id = $2`,
      [req.user.userId, job_completion_client_id]
    );
    if (completionResult.rows.length === 0) {
      return res.status(409).json({ error: 'Parent job completion not synced yet' });
    }
    if (completionResult.rows[0].submitted_at) {
      return res.status(409).json({ error: 'This visit is already completed and can no longer be changed' });
    }
    const jobCompletionId = completionResult.rows[0].id;
    const r2Key = `completions/${jobCompletionId}/${kind}/${client_id}.jpg`;

    if (content_type !== 'image/jpeg') return res.status(400).json({ error: 'Only JPEG uploads are accepted' });
    if (byte_size != null && (!Number.isInteger(byte_size) || byte_size <= 0 || byte_size > 15 * 1024 * 1024)) {
      return res.status(400).json({ error: 'Photo exceeds the 15 MB limit' });
    }
    if (sha256 != null && !/^[a-f0-9]{64}$/i.test(sha256)) return res.status(400).json({ error: 'Invalid sha256' });

    const uploadUrl = await getPresignedUploadUrl(r2Key, content_type);

    await pool.query(
      `INSERT INTO job_completion_photos (job_completion_id, kind, r2_key, client_id, user_id, content_type, byte_size, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, client_id) DO UPDATE SET r2_key = EXCLUDED.r2_key, content_type = EXCLUDED.content_type, byte_size = EXCLUDED.byte_size, sha256 = EXCLUDED.sha256`,
      [jobCompletionId, kind, r2Key, client_id, req.user.userId, content_type, byte_size || null, sha256 || null]
    );

    res.json({ uploadUrl, r2Key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create upload URL' });
  }
});

router.get('/photos/:photoId/url', requireAuth, async (req, res) => {
  const photoId = Number(req.params.photoId);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return res.status(400).json({ error: 'Invalid photoId' });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, p.r2_key, p.user_id, jc.job_segment_id
       FROM job_completion_photos p
       JOIN job_completions jc ON jc.id = p.job_completion_id
       JOIN job_segments js ON js.id = jc.job_segment_id
       WHERE p.id = $1
         AND (
           p.user_id = $2
           OR EXISTS (
             SELECT 1 FROM user_roles ur
             WHERE ur.user_id = $2 AND ur.role = 'admin'
           )
           OR EXISTS (
             SELECT 1 FROM job_assignments ja
             WHERE ja.job_id = js.job_id AND ja.user_id = $2
           )
         )`,
      [photoId, req.user.userId]
    );

    const photo = result.rows[0];
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const url = await getPresignedDownloadUrl(photo.r2_key);
    res.json({ url, expiresIn: 300 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to authorize photo access' });
  }
});

router.put('/photos/confirm', requireAuth, async (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  try {
    const result = await pool.query(
      `UPDATE job_completion_photos SET uploaded_at = now(), synced_at = now()
       WHERE user_id = $1 AND client_id = $2
       RETURNING id, client_id, kind, uploaded_at`,
      [req.user.userId, client_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo record not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

module.exports = router;
