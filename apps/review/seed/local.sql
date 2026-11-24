-- Sample output for trying the review tool locally (`pnpm --filter @roi/review seed:local`).
-- Local database only; never run against staging or production. Re-running it changes nothing.
INSERT OR IGNORE INTO publication (id, title, abstract, published_at, doi, arxiv_id, completeness, created_at, updated_at) VALUES
  ('seed-pub-1', 'Automated reconciliation of hospital medication lists',
   'Hospital pharmacists spend several hours every week reconciling medication lists by hand at admission and discharge. Errors in these lists cause preventable adverse drug events. We evaluate a language model that drafts reconciled lists and find it halves the time needed while keeping error rates unchanged. Existing electronic health record tools only flag duplicates.',
   '2026-11-02', '10.1000/seed.1', '2611.00101', 'complete', '2026-11-20T08:00:00.000Z', '2026-11-20T08:00:00.000Z'),
  ('seed-pub-2', 'A survey of graph neural networks for molecules',
   'We survey graph neural network architectures for molecular property prediction and summarise benchmark results.',
   '2026-11-03', '10.1000/seed.2', NULL, 'complete', '2026-11-20T08:00:00.000Z', '2026-11-20T08:00:00.000Z'),
  ('seed-pub-3', 'Predictive maintenance for wind turbine gearboxes',
   'Wind farm operators lose revenue when gearboxes fail without warning. Since new grid rules from 2026 penalise unplanned outages, operators need earlier warnings. We show vibration models predict failures three weeks ahead.',
   '2026-11-04', NULL, '2611.00303', 'complete', '2026-11-20T08:00:00.000Z', '2026-11-20T08:00:00.000Z');

INSERT OR IGNORE INTO triage_decision (id, publication_id, run_id, status, accepted, score, reason, signal_named_party, signal_stated_harm, signal_trigger, signal_existing_alternative, signal_adoptable, notes, model, prompt_version, admitted_on, created_at, updated_at) VALUES
  ('seed-triage-1', 'seed-pub-1', 'seed-run', 'decided', 1, 0.8, 'accepted', 1, 1, 0, 1, 1, 'Clear user, stated harm, adoptable tool.', '@cf/seed/model', 'triage-v1', '2026-11-22', '2026-11-22T09:00:00.000Z', '2026-11-22T09:00:00.000Z'),
  ('seed-triage-2', 'seed-pub-2', 'seed-run', 'decided', 0, 0.2, 'low-score', 0, 0, 0, 0, 1, 'Survey without a named party.', '@cf/seed/model', 'triage-v1', NULL, '2026-11-22T08:30:00.000Z', '2026-11-22T08:30:00.000Z'),
  ('seed-triage-3', 'seed-pub-3', 'seed-run', 'decided', 1, 1.0, 'accepted', 1, 1, 1, 1, 1, NULL, '@cf/seed/model', 'triage-v1', '2026-11-22', '2026-11-22T08:00:00.000Z', '2026-11-22T08:00:00.000Z');

INSERT OR IGNORE INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode, confidence, notes, candidate_count, created_at) VALUES
  ('seed-extraction-1', 'seed-pub-1', 'seed-run', '@cf/seed/model', 'extraction-v1', 'abstract', 0.6, NULL, 2, '2026-11-22T10:00:00.000Z'),
  ('seed-extraction-3', 'seed-pub-3', 'seed-run', '@cf/seed/model', 'extraction-v1', 'abstract', 0.7, NULL, 1, '2026-11-22T10:00:00.000Z');

INSERT OR IGNORE INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote, customer, customer_quote, why_now, why_now_quote, current_alternative, alternative_quote, hidden_reason, created_at) VALUES
  ('seed-cand-1a', 'seed-pub-1', 'seed-extraction-1', 'Medication reconciliation takes hours of pharmacist time each week', 'spend several hours every week reconciling medication lists by hand', 'Hospital pharmacists', 'Hospital pharmacists', NULL, NULL, 'EHR duplicate flags', 'Existing electronic health record tools only flag duplicates', NULL, '2026-11-22T10:00:00.000Z'),
  ('seed-cand-1b', 'seed-pub-1', 'seed-extraction-1', 'List errors cause preventable adverse drug events', 'Errors in these lists cause preventable adverse drug events', 'Hospitals', 'Hospital pharmacists', NULL, NULL, NULL, NULL, NULL, '2026-11-22T10:00:00.000Z'),
  ('seed-cand-3a', 'seed-pub-3', 'seed-extraction-3', 'Unplanned gearbox failures cost revenue', 'lose revenue when gearboxes fail without warning', 'Wind farm operators', 'Wind farm operators', 'Grid rules penalise unplanned outages', 'new grid rules from 2026 penalise unplanned outages', NULL, NULL, NULL, '2026-11-22T10:00:00.000Z');
