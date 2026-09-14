const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { getPresignedUploadUrl } = require('../r2');

const router = express.Router();

// Upsert the completion record for a finished job segment. The time marker
// itself (job_segments.ended_at) is already recorded the instant Finish is
// tapped — this is the supplementary detail synced on its own schedule.
router.put('/sync', requireAuth, async (req, res) => {
  const { client_id, job_segment_client_id, visit_summary, submitted_at } = req.body;

  if (!client_id || !job_segment_client_id) {
    return res.status(400).json({ error: 'client_id and job_segment_client_id are required' });
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

    const result = await pool.query(
      `INSERT INTO job_completions (job_segment_id, user_id, client_id, visit_summary, submitted_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET visit_summary = EXCLUDED.visit_summary,
             submitted_at = EXCLUDED.submitted_at
       RETURNING id, client_id, job_segment_id, visit_summary, submitted_at`,
      [jobSegmentId, req.user.userId, client_id, visit_summary || null, submitted_at || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Upsert one "part used" line against a completion.
router.put('/parts/sync', requireAuth, async (req, res) => {
  const { client_id, job_completion_client_id, part_id, quantity } = req.body;

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
      `INSERT INTO job_completion_parts (job_completion_id, part_id, quantity, client_id, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, client_id) DO UPDATE SET quantity = EXCLUDED.quantity
       RETURNING id, client_id, part_id, quantity`,
      [jobCompletionId, part_id, quantity || 1, client_id, req.user.userId]
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
  const { client_id, job_completion_client_id, kind } = req.body;

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

    const uploadUrl = await getPresignedUploadUrl(r2Key);

    await pool.query(
      `INSERT INTO job_completion_photos (job_completion_id, kind, r2_key, client_id, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, client_id) DO UPDATE SET r2_key = EXCLUDED.r2_key`,
      [jobCompletionId, kind, r2Key, client_id, req.user.userId]
    );

    res.json({ uploadUrl, r2Key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create upload URL' });
  }
});

router.put('/photos/confirm', requireAuth, async (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  try {
    const result = await pool.query(
      `UPDATE job_completion_photos SET uploaded_at = now()
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
