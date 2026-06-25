function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const HEADERS = [
  'annotation_id', 'item_id', 'intent', 'item_question',
  'first_name', 'last_name', 'email',
  'accuracy', 'source_relevance', 'valid_link', 'exact_matching', 'risk_of_harm',
  'best_model', 'best_generated',
  'created_at', 'updated_at',
];

// opts:
//   { email }              -> only that annotator (test accounts included)
//   { excludeTestEmails }  -> everyone except @testmail.com addresses
//   {}                     -> everyone
function exportCsv(db, opts = {}) {
  let where = '';
  const params = [];
  if (opts.email) {
    where = 'WHERE ann.email = ?';
    params.push(opts.email);
  } else if (opts.excludeTestEmails) {
    where = "WHERE ann.email NOT LIKE '%@testmail.com'";
  }
  const rows = db
    .prepare(
      `SELECT an.id, an.item_id, i.intent, i.question AS item_question,
         ann.first_name, ann.last_name, ann.email,
         an.accuracy, an.source_relevance, an.valid_link, an.exact_matching, an.risk_of_harm,
         an.best_model, g.generated AS best_generated,
         an.created_at, an.updated_at
       FROM annotations an
       JOIN items i ON i.id = an.item_id
       JOIN annotators ann ON ann.id = an.annotator_id
       LEFT JOIN generations g ON g.item_id = an.item_id AND g.model = an.best_model
       ${where}
       ORDER BY an.item_id, an.annotator_id`
    )
    .all(...params);
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [r.id, r.item_id, r.intent, r.item_question, r.first_name, r.last_name, r.email,
       r.accuracy, r.source_relevance, r.valid_link, r.exact_matching, r.risk_of_harm,
       r.best_model, r.best_generated,
       r.created_at, r.updated_at].map(csvCell).join(',')
    );
  }
  return lines.join('\n') + '\n';
}

module.exports = { exportCsv };
