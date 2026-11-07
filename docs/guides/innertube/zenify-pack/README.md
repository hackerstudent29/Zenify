# Zenify Agent Pack

1. Create an empty repo and extract this zip into its root.
2. Review and run `scripts/bootstrap.sh` (creates the Flutter project, merges starter files).
3. Merge `starter/pubspec.yaml` dependencies; add fonts/IRs per `zenify-docs/13-ASSETS-CHECKLIST.md`.
4. Open your agent (e.g. Claude Code) in the repo. It reads `CLAUDE.md` automatically.
5. Start with: "Do task P1-01 from zenify-docs/14-TASK-BACKLOG.md, following CLAUDE.md." Continue in order, or use the phase prompts in `zenify-docs/10-AGENT-PROMPTS.md`.

Contents
- `CLAUDE.md`: agent rules (includes resilience rules)
- `zenify-docs/` (00-16): architecture, design system, motion, screens, engine, DSP, backend, roadmap, prompts, setup, API contracts, assets, backlog (P1-P10), decisions, resilience playbook
- `starter/`: pubspec, analysis options, mock catalog and LRC, `remote_config.sample.json`, `lib/remote_config_service.dart`
- `reference/services/`: resilient `InnerTubeTransport`, `InnerTubeService`, `ArtistService`, `ApiService` (adopt in P10-01)
- `reference/ui/`: `spring_kit.dart`, redesigned Explore and Library screens
- `scripts/bootstrap.sh`

Code is untested template code; verify on first build. Resilience work is Phase 10 and can start as soon as Phase 2 playback works.
