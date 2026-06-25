function saveAnnotation(db, annotatorId, itemId, values, bestModel, nowIso) {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO annotations
         (item_id, annotator_id, accuracy, source_relevance, valid_link, exact_matching, risk_of_harm, best_model, created_at, updated_at)
       VALUES (@item_id,@annotator_id,@accuracy,@source_relevance,@valid_link,@exact_matching,@risk_of_harm,@best_model,@now,@now)
       ON CONFLICT(item_id, annotator_id) DO UPDATE SET
         accuracy=excluded.accuracy,
         source_relevance=excluded.source_relevance,
         valid_link=excluded.valid_link,
         exact_matching=excluded.exact_matching,
         risk_of_harm=excluded.risk_of_harm,
         best_model=excluded.best_model,
         updated_at=excluded.updated_at`
    ).run({
      item_id: itemId,
      annotator_id: annotatorId,
      accuracy: values.accuracy,
      source_relevance: values.source_relevance,
      valid_link: values.valid_link,
      exact_matching: values.exact_matching,
      risk_of_harm: values.risk_of_harm,
      best_model: bestModel,
      now: nowIso,
    });
    db.prepare('DELETE FROM claims WHERE item_id = ? AND annotator_id = ?').run(itemId, annotatorId);
  })();
}

module.exports = { saveAnnotation };
