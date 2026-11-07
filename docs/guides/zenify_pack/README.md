# Zenify Agent Pack

1. Create an empty repo and extract this zip into its root.
2. Review and run `scripts/bootstrap.sh` (creates the Flutter project, merges starter files).
3. Merge `starter/pubspec.yaml` dependencies; add fonts/IRs per `zenify-docs/13-ASSETS-CHECKLIST.md`.
4. Open your agent (e.g. Claude Code) in the repo. It reads `CLAUDE.md` automatically.
5. Start with: "Do task P1-01 from zenify-docs/14-TASK-BACKLOG.md, following CLAUDE.md." Then continue in order, or use the phase prompts in `zenify-docs/10-AGENT-PROMPTS.md`.

Contents: `CLAUDE.md`, `zenify-docs/` (00-15), `starter/` (pubspec, analysis options, mock catalog and LRC), `scripts/bootstrap.sh`.
Code snippets and package versions are untested templates; verify on first build.
