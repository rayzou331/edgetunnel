# Cloudflare Workers deployment

This fork is configured for this flow:

1. Cloudflare Cron Worker checks whether `rayzzzzzz331/edgetunnel` is behind `cmliu/edgetunnel`.
2. If upstream has new commits, the Cron Worker sends a GitHub `repository_dispatch` event.
3. GitHub Actions runs the upstream sync workflow.
4. A push to `main` redeploys `_worker.js` to Cloudflare Workers.

## Required GitHub Actions secrets

Add these in GitHub: `Settings` -> `Secrets and variables` -> `Actions`.

Required:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Workers Scripts edit and Workers KV Storage edit permissions.
- Or `CLOUDFLARE_REFRESH_TOKEN`: Wrangler OAuth refresh token. If both are present, `CLOUDFLARE_API_TOKEN` is used.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `EDGETUNNEL_ADMIN`: Admin password for `/admin`.
- `MONITOR_GITHUB_TOKEN`: GitHub token that can call `repository_dispatch` on this repo.

Optional edgetunnel Worker secrets:

- `EDGETUNNEL_KEY`
- `EDGETUNNEL_UUID`
- `EDGETUNNEL_PROXYIP`
- `EDGETUNNEL_URL`
- `EDGETUNNEL_GO2SOCKS5`
- `EDGETUNNEL_DEBUG`
- `EDGETUNNEL_OFF_LOG`
- `EDGETUNNEL_BEST_SUB`
- `EDGETUNNEL_PRELOAD_RACE_DIAL`

Optional monitor secret:

- `MONITOR_TOKEN`: protects manual `https://<monitor-worker>/check` calls. Cron does not need it.

## Optional GitHub Actions variables

- `EDGETUNNEL_WORKER_NAME`: default `edgetunnel`.
- `EDGETUNNEL_KV_TITLE`: default `edgetunnel-kv`.
- `MONITOR_WORKER_NAME`: default `edgetunnel-upstream-monitor`.
- `MONITOR_KV_TITLE`: default `edgetunnel-monitor-kv`.

## First deploy

After the secrets are set:

1. Run `Deploy edgetunnel Worker` manually once.
2. Run `Deploy Cloudflare upstream monitor` manually once.
3. Visit `https://<your-edgetunnel-worker-domain>/admin`.

The deploy workflows create the required KV namespaces automatically if they do not exist.
