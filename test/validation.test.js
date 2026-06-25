const { test } = require('node:test');
const assert = require('node:assert');
const { answerHasLink, intentRequiresYesNo, validateAnnotation } = require('../src/validation');

test('answerHasLink detects markdown links', () => {
  assert.equal(answerHasLink('see [here](http://x)'), true);
  assert.equal(answerHasLink('no link here'), false);
});

test('intentRequiresYesNo only for exact string', () => {
  assert.equal(intentRequiresYesNo('yes/no eligibility'), true);
  assert.equal(intentRequiresYesNo('comparison of options'), false);
});

test('always-required scales validated; non-applicable must be absent', () => {
  const item = { answer: 'plain text', intent: 'comparison of options' };
  const ok = validateAnnotation(item, { accuracy: 4, source_relevance: 5 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, {
    accuracy: 4, source_relevance: 5, valid_link: null, exact_matching: null, risk_of_harm: null,
  });

  const bad = validateAnnotation(item, { accuracy: 9, source_relevance: 5 });
  assert.equal(bad.ok, false);

  const extra = validateAnnotation(item, { accuracy: 4, source_relevance: 5, valid_link: 1 });
  assert.equal(extra.ok, false, 'valid_link not applicable when answer has no link');
});

test('conditional metrics required when applicable', () => {
  const item = { answer: 'go [here](http://x)', intent: 'yes/no eligibility' };
  const missing = validateAnnotation(item, { accuracy: 3, source_relevance: 3 });
  assert.equal(missing.ok, false, 'valid_link, exact_matching, risk_of_harm required');

  const good = validateAnnotation(item, {
    accuracy: 3, source_relevance: 3, valid_link: 0, exact_matching: 1, risk_of_harm: 0,
  });
  assert.equal(good.ok, true);
  assert.deepEqual(good.values, {
    accuracy: 3, source_relevance: 3, valid_link: 0, exact_matching: 1, risk_of_harm: 0,
  });
});
