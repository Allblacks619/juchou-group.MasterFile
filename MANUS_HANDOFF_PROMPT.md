# MANUS HANDOFF PROMPT

Please verify the AppRates UI patch with this checklist:

1) 個別単価 create dialog
- Confirm **適用範囲** appears for 個別単価 with options:
  - 現場別 + 作業員
  - 取引先別 + 作業員
- Confirm required keys by scope:
  - project scope: employeeId + projectId
  - client scope: employeeId + clientId

2) Payload behavior
- Confirm individual project-scope sends `scopeType=project` + `projectId`.
- Confirm individual client-scope sends `scopeType=client` + `clientId`.
- Confirm billing-only / payment-only submissions are accepted.
- Confirm both-empty billing/payment submission is rejected.

3) Main rate list profit rendering
- Confirm columns/cards show:
  - 売上単価
  - 支払単価
  - 粗利/日
- Confirm 粗利/日 is shown only when both rates exist.
- Confirm missing side renders as `—`/`未設定` (no 0 fallback math).
- Confirm negative profit is red and warning text appears:
  - 支払単価が売上単価を上回っています。赤字になります。

4) Mobile behavior
- Confirm no horizontal overflow in create dialog/rate cards.
- Confirm selector/inputs/buttons remain tappable and stacked vertically.
