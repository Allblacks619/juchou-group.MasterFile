# KNOWN ISSUES

1. Build warnings from Vite remain for missing analytics env placeholders in `index.html` and large chunk-size warnings; these are pre-existing/non-blocking.
2. Overlap warning is computed at list time and indicates key-window overlap, but does not yet provide pairwise detail lines.
3. Mobile rates list uses read-focused cards; inline edit remains primarily optimized for desktop table flow.
4. Rate entry still requires both 売上単価 and 支払単価 on a single record creation path; future UX split (independent lifecycle per layer) can be improved without changing current data model.
