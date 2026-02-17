[0] In this sandbox, dependency installs can fail for two environment reasons: `pnpm install` may require `CI=true` in non-TTY mode, and external registry resolution (`registry.npmjs.org`) may be unavailable, which blocks lockfile/dependency updates.

[0] When adding features or changing CLI behavior, always update three files: `AGENTS.md`, `README.md`, and `docs/CLI_REFERENCE.md`. This keeps all documentation in sync and helps future developers (including AI agents) understand the current state.

[0] X Articles (long-form content on X/Twitter) cannot be extracted because they require JavaScript execution to render. The content is not in the initial HTML response. Sites that require JS rendering will need either headless browser integration or should be saved with --no-extract.

[0] In Commander async actions, wrapping logic in a synchronous try/catch helper is not enough; promise rejections bypass that catch unless the helper also handles Promise returns (`result instanceof Promise ? result.catch(...) : result`).

[0] Keep the main `test` script generic (`vitest run`) so new tests are auto-discovered; reserve file-specific script arguments for targeted runs like `test:integration`.

[0] When loading data for a single CLI action, prefer one joined DB query over sequential queries when it keeps semantics clear (e.g., item + note content for `tts`).

[0] To auto-load `.env` in npm scripts consistently, use a small wrapper script that calls `dotenv.config({ path: '.env', override: false })` and then spawns the target command.

[0] Edge TTS provider uses an unofficial Microsoft API endpoint that can break or change without notice. When getting 404 errors, the Edge endpoint is likely down/blocked. Need to implement alternative TTS providers (OpenAI, ElevenLabs, local) for reliability.
