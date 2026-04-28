# Parrish HALO — Backup & Restore Runbook

**Project:** `parrish-harmonyhca` · **Region:** `us-east1` · **Bucket:** `gs://parrish-halo-firestore-backups`

This document is the operational source of truth for Firestore backup and restore on Parrish HALO. Anyone with `gcloud` access and the appropriate IAM roles should be able to follow this procedure with no additional context.

---

## What is backed up

- **Scope:** Full Firestore database `(default)` — all collections, all documents.
- **Cadence:** Daily at 02:00 America/New_York via Cloud Scheduler job `firestore-daily-backup`.
- **Format:** Firestore native export (LevelDB-style metadata + per-collection data). Not human-readable; restorable only via `gcloud firestore import`.
- **Storage class lifecycle:**
  - Day 0–30: **Standard** (immediate access)
  - Day 30–90: **Nearline** (lower cost, slight retrieval delay)
  - Day 90–365: **Coldline** (archival)
  - After day 365: **deleted**

If compliance requires longer retention, update the lifecycle policy in §"Update retention" below.

---

## Listing available backups

```bash
gsutil ls gs://parrish-halo-firestore-backups/
```

Daily automated backups land under `daily/` with timestamped folders. Manual backups land at the path you specified when running the export.

To inspect the contents of a single backup:

```bash
gsutil ls gs://parrish-halo-firestore-backups/daily/2026-04-27T07:00:00_12345/
```

Each backup folder contains an `all_namespaces` directory with one subdirectory per collection plus an overall metadata file.

---

## Running a manual backup

Use this before any risky migration, schema change, or large bulk update.

```bash
gcloud firestore export gs://parrish-halo-firestore-backups/manual-$(date +%Y%m%d-%H%M%S) \
  --project=parrish-harmonyhca
```

Wait for the operation to complete (1–5 minutes typical). Verify the directory now exists:

```bash
gsutil ls gs://parrish-halo-firestore-backups/ | grep manual-
```

To export only specific collections (faster, smaller):

```bash
gcloud firestore export gs://parrish-halo-firestore-backups/manual-certs-$(date +%Y%m%d) \
  --collection-ids=certificates,courses \
  --project=parrish-harmonyhca
```

---

## Restoring from a backup

> **Warning:** `firestore import` overwrites existing documents that share an ID with imported documents. It does **not** delete documents in the live database that are absent from the backup. To get a true point-in-time restore, you must delete current data first — and that is irreversible. Coordinate with stakeholders before running anything below.

### 1. Pick a backup

```bash
gsutil ls gs://parrish-halo-firestore-backups/daily/
```

Copy the full path of the folder you want.

### 2. Dry-run plan

Decide whether you are doing:
- **Targeted restore** — single collection, e.g. accidental deletion of a few `certificates/*` records.
- **Full restore** — entire database, e.g. catastrophic corruption.

Targeted restores are almost always the right choice and far less risky.

### 3. Targeted restore (preferred)

```bash
gcloud firestore import gs://parrish-halo-firestore-backups/daily/2026-04-27T07:00:00_12345 \
  --collection-ids=certificates \
  --project=parrish-harmonyhca
```

Replace the path and `--collection-ids` list with the actual values.

### 4. Full restore (only when nothing else works)

```bash
gcloud firestore import gs://parrish-halo-firestore-backups/daily/2026-04-27T07:00:00_12345 \
  --project=parrish-harmonyhca
```

**Before running a full restore, freeze writes** — disable Cloud Functions or rotate the security rules to read-only for the duration of the import. Otherwise concurrent user writes will interleave with the import and produce inconsistent state.

### 5. Verify

After import completes:

```bash
gcloud firestore operations list --project=parrish-harmonyhca --filter="metadata.operationType=IMPORT_DOCUMENTS" --limit=5
```

Confirm `state: SUCCESSFUL`. Then spot-check a handful of restored documents through the Firebase Console.

---

## Update retention

Edit `lifecycle.json` and re-apply:

```bash
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"}, "condition": {"age": 30}},
    {"action": {"type": "SetStorageClass", "storageClass": "COLDLINE"}, "condition": {"age": 90}},
    {"action": {"type": "Delete"}, "condition": {"age": 365}}
  ]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://parrish-halo-firestore-backups
gsutil lifecycle get gs://parrish-halo-firestore-backups
```

Adjust the `age` values to match the desired retention. Compliance requirements (HIPAA, CMS audit) may dictate a minimum.

---

## Inspecting the scheduled job

```bash
gcloud scheduler jobs describe firestore-daily-backup \
  --location=us-east1 --project=parrish-harmonyhca

gcloud scheduler jobs list \
  --location=us-east1 --project=parrish-harmonyhca
```

To pause backups temporarily:

```bash
gcloud scheduler jobs pause firestore-daily-backup \
  --location=us-east1 --project=parrish-harmonyhca
```

Resume with `gcloud scheduler jobs resume`. **Do not leave the job paused** — every day paused is a day with no recovery point.

---

## Required IAM (one-time, already configured)

The App Engine default service account `parrish-harmonyhca@appspot.gserviceaccount.com` needs:

- `roles/datastore.importExportAdmin` — to trigger Firestore export/import
- `roles/storage.objectAdmin` — to write export artifacts to the bucket

If an export ever fails with a 403, re-apply:

```bash
gcloud projects add-iam-policy-binding parrish-harmonyhca \
  --member="serviceAccount:parrish-harmonyhca@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

gcloud projects add-iam-policy-binding parrish-harmonyhca \
  --member="serviceAccount:parrish-harmonyhca@appspot.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

## Disaster recovery drill (recommended quarterly)

1. Pick a non-critical collection (e.g. `auditLogs` or a test sub-collection).
2. Export only that collection to `gs://parrish-halo-firestore-backups/drill-$(date +%Y%m%d)`.
3. Delete one document.
4. Run a targeted import limited to that collection.
5. Confirm the deleted document is back.

Document the time-to-restore in this file so you have a real number to give CMS/legal when they ask.

---

*Parrish HALO · Parrish Health Systems*
