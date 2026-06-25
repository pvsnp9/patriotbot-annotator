const express = require('express');
const path = require('path');
const { upsertAnnotator } = require('./annotators');
const { getNextItem, getPresentedModels, CAP } = require('./pool');
const { validateAnnotation } = require('./validation');
const { saveAnnotation } = require('./annotations');
const { getProgress, getModelWins } = require('./progress');
const { exportCsv } = require('./export');

function createApp(db, { progressKey } = {}) {
  const app = express();
  app.use(express.json());

  app.post('/session', (req, res) => {
    try {
      const { first_name, last_name, email, agreed } = req.body || {};
      if (agreed !== true) return res.status(400).json({ error: 'consent required' });
      const id = upsertAnnotator(db, { first_name, last_name, email }, new Date().toISOString());
      res.json({ id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // look up an annotator by email so a returning user can resume without re-consenting
  app.post('/lookup', (req, res) => {
    const email = req.body && req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    if (!email) return res.status(400).json({ error: 'email required' });
    const row = db.prepare('SELECT id, first_name, last_name FROM annotators WHERE email = ?').get(email);
    if (row) res.json({ exists: true, id: row.id, first_name: row.first_name, last_name: row.last_name });
    else res.json({ exists: false });
  });

  app.get('/next', (req, res) => {
    const annotatorId = Number(req.query.annotator_id);
    if (!annotatorId) return res.status(400).json({ error: 'annotator_id required' });
    res.json(getNextItem(db, annotatorId));
  });

  app.post('/annotate', (req, res) => {
    const annotatorId = Number(req.body && req.body.annotator_id);
    const itemId = Number(req.body && req.body.item_id);
    if (!annotatorId || !itemId) return res.status(400).json({ error: 'annotator_id and item_id required' });
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) return res.status(404).json({ error: 'item not found' });

    // map the picked option index back to its (server-side) model
    const models = getPresentedModels(db, annotatorId, itemId);
    const idx = req.body.best_option_idx;
    if (!Number.isInteger(idx) || idx < 0 || idx >= models.length) {
      return res.status(400).json({ error: 'best_pick', details: 'best_option_idx out of range' });
    }
    const bestModel = models[idx];

    const { ok, errors, values } = validateAnnotation(item, req.body);
    if (!ok) return res.status(400).json({ error: 'validation', details: errors });

    saveAnnotation(db, annotatorId, itemId, values, bestModel, new Date().toISOString());
    res.json({ ok: true });
  });

  const queryKeyOk = (req, res) => {
    if (!progressKey || req.query.key !== progressKey) {
      res.status(401).send('unauthorized');
      return false;
    }
    return true;
  };
  const bodyKeyOk = (req, res) => {
    if (!progressKey || !req.body || req.body.key !== progressKey) {
      res.status(401).json({ error: 'incorrect' });
      return false;
    }
    return true;
  };

  // progress dashboard page (public); the password is validated by the POSTs below
  app.get('/progress', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'progress.html'));
  });

  // validate the pass and return the annotator list
  app.post('/progress/data', (req, res) => {
    if (!bodyKeyOk(req, res)) return;
    res.json({ annotators: getProgress(db, CAP), modelWins: getModelWins(db) });
  });

  // download CSV: { email } -> just that annotator; otherwise everyone except @testmail.com
  app.post('/progress/export', (req, res) => {
    if (!bodyKeyOk(req, res)) return;
    const email = req.body && req.body.email ? String(req.body.email) : null;
    const csv = email ? exportCsv(db, { email }) : exportCsv(db, { excludeTestEmails: true });
    res.type('text/csv').send(csv);
  });

  // curl-friendly combined export (key in URL); also excludes @testmail.com
  app.get('/export.csv', (req, res) => {
    if (!queryKeyOk(req, res)) return;
    res.type('text/csv').attachment('annotations.csv').send(exportCsv(db, { excludeTestEmails: true }));
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

module.exports = { createApp };
