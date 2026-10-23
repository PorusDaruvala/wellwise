# Legacy

For history and review only. The app does not use these files.

| File | What it is |
|---|---|
| `Wellwise_V2_200_Tips_Agent_Prototype.html` | The original V2 prototype. |
| `migrate_v2_to_v3.py` | The one-time script that turned V2 data into `content/wellwise-content.json`: tag fixes, grades, safety classes, notes, trigger keys, links and moments. |
| `sources_more.py` | The tip-level sources found on 2026-10-23, used by the migration. |

To re-run the migration, run `python3 migrate_v2_to_v3.py` from inside this folder. It writes a fresh `wellwise-content.json` here. Do not copy that file over the live library without a review; the live library may hold newer edits.
