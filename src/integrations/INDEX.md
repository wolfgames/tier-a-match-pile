# Integrations

Cross-cutting integrations that wire the game into a host environment. Distinct from `src/modules/` (game-internal building blocks).

| Integration | Purpose |
|-------------|---------|
| `embed/` | Publisher-embed integration: URL-param contract, attract gate, redirect on engage. |
| `vault/` | Games Vault integration: host lifecycle bridge (mounted by default) + Daily Editions consumer seam. |
