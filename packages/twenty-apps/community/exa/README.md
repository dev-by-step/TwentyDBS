# @twenty-apps/exa

Exposes [Exa](https://exa.ai) structured web search to Twenty AI agents
(chat + workflow agents + MCP) as the `app_exa_web_search` tool.

## Configuration

Server admin sets two env vars:

- `PRE_INSTALLED_APPS=@twenty-apps/exa` — installs this app on every new
  workspace. Existing workspaces backfill via the
  `install-pre-installed-apps` CLI command.
- `EXA_API_KEY=<key>` — auto-seeded into the application registration's
  server variables at server bootstrap. No per-workspace configuration
  needed.

## Billing

The handler calls Twenty's generic app billing endpoint
(`POST /app/billing/charge`) using the application access token injected
into the execution env. Pricing mirrors Exa's auto-search tier: $0.007
base (10 results) + $0.001 per additional result.
