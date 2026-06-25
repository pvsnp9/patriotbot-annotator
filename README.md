# Patriotbot FAQ Annotation Platform

Lightweight one-off annotation tool. Node + Express + SQLite, Dockerized.

For each FAQ item, an annotator (after consenting) makes two judgments:

1. **Rates the reference test pair** on up to 5 metrics (accuracy, source
   relevance, valid link, exact matching, risk of harm).
2. **Picks the single best generated answer** among 3 SFT-model outputs, shown
   **blind (model hidden) and shuffled**. The server records which model won.

Each item is annotated by **2 distinct annotators** (double coverage); each
annotator is capped at **100 items**, pulled first-come from a shared pool with
in-session Back/Next. Progress is tracked per user; results export to CSV.

## Local dev
```bash
npm install
npm test
PROGRESS_KEY=test npm start   # http://localhost:3000
```

## Seed data (drop your real files into `seed/` before first run)
- `seed/items.json` — the items to annotate. Fields used: `id, question,
  answer, department, persona, intent, url, page_type, source_seed_id`.
- `seed/seeds.json` — the source seeds. Fields used: `id, question, answer,
  department, url, page_type`. Linked by `items.source_seed_id` → `seeds.id`.
- `seed/models/*.json` — **one file per model** (3 of them). Each row:
  `{ id, generated, model, mode }` (other fields ignored). `id` → `items.id`.

Seeding only runs when a table is empty; it never overwrites annotations. Tests
use their own fixtures in `test/fixtures/`, so replacing `seed/` data is safe.

## Annotation rules
- **Answer accuracy** (1–5) and **Source relevance** (1–5): always required.
- **Valid link** (Yes/No): only when the item answer contains a markdown link.
- **Exact matching** + **Risk of harm** (Yes/No): only when `intent == "yes/no eligibility"`.
- **Best answer**: exactly one generated option must be picked.

The server re-validates all of these on submit.

## Deploy (GCP e2-micro, Debian) — HTTP on the VM's public IP
1. Create an Always-Free `e2-micro` (us-central1/us-west1/us-east1); allow HTTP (port 80).
2. Install Docker + the compose plugin.
3. `cp .env.example .env` and set a strong `PROGRESS_KEY`.
4. `sudo mkdir -p /opt/annotator/data`
5. `docker compose up -d --build`

Access at **`http://<VM_PUBLIC_IP>/`**. The DB persists at
`/opt/annotator/data/annotations.db` and survives rebuilds. No DNS name or TLS
is used (plain HTTP, per project decision).

## Progress & export (key-gated)
- Progress bars: `http://<VM_PUBLIC_IP>/progress?key=PROGRESS_KEY`
- CSV export:    `http://<VM_PUBLIC_IP>/export.csv?key=PROGRESS_KEY`

## Backup / teardown
- Backup: `cp /opt/annotator/data/annotations.db ~/backup-$(date +%F).db`
- Teardown: pull the CSV, then delete the VM.
