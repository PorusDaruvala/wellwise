# Tip packs

Put new tips here, one JSON file per batch. Name each file by date and topic, for example `2026-11-monsoon.json`.

- The shape is in `../schema/tip-pack.schema.json`.
- Download a blank pack from the admin console (`/admin`).
- Check one pack: `python3 scripts/build.py --check content/packs/<file>.json`
- Fold all packs into the library: `python3 scripts/build.py --merge`. Then delete the merged files.

The full guide is in `docs/CONTENT_GUIDE.md`.
