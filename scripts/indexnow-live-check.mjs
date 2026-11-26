const truthy = (value) => /^(1|true|yes)$/i.test(String(value ?? ""));

export function isLiveCheckEnabled(env = process.env) {
  const runningInCi = truthy(env.CI) || truthy(env.GITHUB_ACTIONS);
  return env.INDEXNOW_LIVE_CHECK === "1" && !runningInCi;
}

export function isLoopbackHostname(hostname) {
  const value = String(hostname ?? "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}
