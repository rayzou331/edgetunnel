const DEFAULTS = {
  upstreamOwner: "cmliu",
  upstreamRepo: "edgetunnel",
  targetOwner: "rayzzzzzz331",
  targetRepo: "edgetunnel",
  branch: "main",
  dispatchEventType: "upstream-update",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "edgetunnel-upstream-monitor" });
    }

    if (url.pathname !== "/check") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const configuredToken = env.MONITOR_TOKEN;
    if (configuredToken) {
      const receivedToken = request.headers.get("x-monitor-token") || url.searchParams.get("token");
      if (receivedToken !== configuredToken) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
    }

    try {
      return json(await checkForUpstreamUpdate(env, "manual"));
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkForUpstreamUpdate(env, "cron"));
  },
};

async function checkForUpstreamUpdate(env, source) {
  const config = readConfig(env);
  const compare = await githubJson(
    `/repos/${config.upstreamOwner}/${config.upstreamRepo}/compare/${config.branch}...${config.targetOwner}:${config.branch}`,
    env,
  );

  const upstreamSha = compare.base_commit?.sha;
  const behindBy = compare.behind_by || 0;

  if (!upstreamSha) {
    throw new Error("GitHub compare response did not include an upstream SHA");
  }

  if (behindBy === 0) {
    await writeState(env, "last_seen_upstream_sha", upstreamSha);
    await writeState(env, "last_status", "current");
    return {
      ok: true,
      status: "current",
      source,
      upstreamSha,
      aheadBy: compare.ahead_by || 0,
      behindBy,
    };
  }

  const lastDispatchedSha = await readState(env, "last_dispatched_upstream_sha");
  if (lastDispatchedSha === upstreamSha) {
    return {
      ok: true,
      status: "already_dispatched",
      source,
      upstreamSha,
      aheadBy: compare.ahead_by || 0,
      behindBy,
    };
  }

  if (!env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN secret for repository_dispatch");
  }

  await githubJson(`/repos/${config.targetOwner}/${config.targetRepo}/dispatches`, env, {
    method: "POST",
    body: JSON.stringify({
      event_type: config.dispatchEventType,
      client_payload: {
        source,
        upstream: `${config.upstreamOwner}/${config.upstreamRepo}`,
        target: `${config.targetOwner}/${config.targetRepo}`,
        branch: config.branch,
        upstreamSha,
        aheadBy: compare.ahead_by || 0,
        behindBy,
      },
    }),
  });

  await writeState(env, "last_dispatched_upstream_sha", upstreamSha);
  await writeState(env, "last_status", "dispatched");

  return {
    ok: true,
    status: "dispatched",
    source,
    upstreamSha,
    aheadBy: compare.ahead_by || 0,
    behindBy,
  };
}

function readConfig(env) {
  return {
    upstreamOwner: env.UPSTREAM_OWNER || DEFAULTS.upstreamOwner,
    upstreamRepo: env.UPSTREAM_REPO || DEFAULTS.upstreamRepo,
    targetOwner: env.TARGET_OWNER || DEFAULTS.targetOwner,
    targetRepo: env.TARGET_REPO || DEFAULTS.targetRepo,
    branch: env.BRANCH || DEFAULTS.branch,
    dispatchEventType: env.DISPATCH_EVENT_TYPE || DEFAULTS.dispatchEventType,
  };
}

async function githubJson(path, env, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", "edgetunnel-cloudflare-monitor");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  if (env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 500)}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

async function readState(env, key) {
  if (!env.SYNC_STATE) return null;
  return env.SYNC_STATE.get(key);
}

async function writeState(env, key, value) {
  if (!env.SYNC_STATE) return;
  await env.SYNC_STATE.put(key, value);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
