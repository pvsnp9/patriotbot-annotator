function getProgress(db, cap = 100) {
  const rows = db
    .prepare(
      `SELECT a.id, a.first_name, a.last_name, a.email,
         (SELECT COUNT(*) FROM annotations an WHERE an.annotator_id = a.id) AS count
       FROM annotators a
       ORDER BY a.created_at, a.id`
    )
    .all();
  return rows.map((r) => ({ ...r, cap, pct: Math.round((r.count / cap) * 100) }));
}

// Best-answer wins per model (which model annotators picked as best),
// excluding @testmail.com test accounts. Ordered by count desc.
function getModelWins(db) {
  return db
    .prepare(
      `SELECT an.best_model AS model, COUNT(*) AS count
       FROM annotations an
       JOIN annotators ann ON ann.id = an.annotator_id
       WHERE ann.email NOT LIKE '%@testmail.com'
       GROUP BY an.best_model
       ORDER BY count DESC, model`
    )
    .all();
}

module.exports = { getProgress, getModelWins };
