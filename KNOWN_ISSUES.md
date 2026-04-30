# KNOWN ISSUES

1. `pnpm build` emits existing non-blocking warnings for missing analytics env placeholders in `index.html`; this patch does not alter analytics configuration.
2. `pnpm build` still reports large chunk-size warnings in production bundle; this is pre-existing and out of scope.
3. `pnpm test` prints expected stderr lines in `customAuth` invitation tests about DB unavailability while tests still pass; this is pre-existing test behavior.
