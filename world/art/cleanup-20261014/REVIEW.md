# Project cleanup — 2026-10-14

Completed locally in the active `release-npc-20261006` checkout. The owner explicitly authorized deletion of unused files, including superseded source/review copies. Sibling checkouts and published deployment state were not modified.

## Deleted

**377 obsolete files, 3,211,820,432 bytes (3.21 GB / 2.99 GiB)** removed. The deletion manifest records every path, size and reason.

- Superseded Blender working scenes and automatic backups, old model baselines and intermediate exports.
- Rejected female regeneration files; the original active female is preserved.
- Superseded comparison renders/screenshots. Written historical findings remain, with current visual evidence retained.
- Nine unreferenced legacy website images.
- Two font-spider backups byte-identical to the retained current fonts.
- An unused standalone `dialog.css`; dialog source SCSS and the active merged `layout.css` remain.
- The obsolete local M.O.T.H snapshot middleware, its import and its route fixture test. The cabinet now uses the live public game.

Local working files under `world/.artifacts/` are now excluded from Git staging by `.gitignore`, so intermediate exports are kept separate from shipped assets.

## Preserved

**1,393 protected files** were hashed before deletion and verified unchanged both afterward and after the full test/build run. This includes current game assets, public/staff M.O.T.H routes, both BETA/PS2 release channels, active legacy page assets/fonts and required source inputs.

Current editable Blender sources retained:

- Male: `.artifacts/male-wave-side-20261013/waist-weight-fixed.blend`.
- Cabinet: `.artifacts/moth-arcade-orange-20261014/cabinet-polished.blend`.
- Attendant: `.artifacts/attendant-forearms-20261011/forearms-and-fingers.blend`.
- Original female/shared limb source: `.artifacts/swim-body-match-20261011/swim-body-matched.blend`.
- The input scene explicitly required by the retained shoulder repair command: `.artifacts/male-wave-20261013/production-before.blend`.

Original accepted generation inputs and the default guitar/venue repair inputs also remain. See `deletion-manifest.json` for the exact preserved source paths.

## Inspection and verification

All **77 non-declaration TypeScript modules** are reachable from the project's runtime or local review entry pages. Strict compilation also checks unused locals and parameters. Every current game model is referenced. Source-only print/logo inputs remain because the asset preparation tools use them.

The asset audit checks HTML, JavaScript, TypeScript, CSS/SCSS, Pug, manifests and asset-preparation scripts. The webcam images use template URLs; those were inspected separately and retained. Every retained compiled BETA/PS2 asset has a reference in its release dependencies or integrity data. Old cached JavaScript/CSS dependency chains and both channels were preserved.

**453/453 full tests and TypeScript/Vite build pass.** The first sandboxed test attempt could not open loopback server ports; the complete suite subsequently passed with that access. The rebuilt local browser entered the world, rendered the retained models, opened the current public M.O.T.H game, navigated with native keyboard input and exited/re-entered. No console errors were captured. Physical phone/headset validation was not performed.

Removing these files frees project/storage space. The old local scenes and review images were never part of gameplay downloads; all assets the running world actually loads remain intact.

## Evidence

- `deletion-manifest.json`: deletion paths, reasons, bytes and current source files.
- `asset-audit.json`: direct and template asset references.
- `module-audit.json`: TypeScript reachability from all entry pages.
- `release-audit.json`: current/cached release asset reference check.
- `preservation.json`: all protected file hashes.
- `validation.json`: test/build/browser results.
- `.artifacts/cleanup-20261014/tests.log` and `build.log`.
- `world-after.png`: current world rendering after cleanup.

Historical reports can reference former intermediate files/images deliberately removed by this cleanup. Their recorded findings remain; use the current source index above and latest review evidence for further edits.

No publication was performed. Local preview: http://127.0.0.1:4173/?era=ps2&island&review=arcade&cycleMinute=15
