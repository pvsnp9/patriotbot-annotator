const LINK_RE = /\[[^\]]*\]\([^)]*\)/;
const YESNO_INTENT = 'yes/no eligibility';

function answerHasLink(answer) {
  return typeof answer === 'string' && LINK_RE.test(answer);
}

function intentRequiresYesNo(intent) {
  return intent === YESNO_INTENT;
}

function validateAnnotation(item, payload) {
  const errors = [];
  const values = {
    accuracy: null, source_relevance: null,
    valid_link: null, exact_matching: null, risk_of_harm: null,
  };

  for (const key of ['accuracy', 'source_relevance']) {
    const v = payload[key];
    if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${key} must be an integer 1..5`);
    else values[key] = v;
  }

  const applies = {
    valid_link: answerHasLink(item.answer),
    exact_matching: intentRequiresYesNo(item.intent),
    risk_of_harm: intentRequiresYesNo(item.intent),
  };
  for (const key of ['valid_link', 'exact_matching', 'risk_of_harm']) {
    const v = payload[key];
    if (applies[key]) {
      if (v !== 0 && v !== 1) errors.push(`${key} must be 0 or 1`);
      else values[key] = v;
    } else if (v !== undefined && v !== null) {
      errors.push(`${key} not applicable for this item`);
    }
  }

  return { ok: errors.length === 0, errors, values };
}

module.exports = { answerHasLink, intentRequiresYesNo, validateAnnotation };
