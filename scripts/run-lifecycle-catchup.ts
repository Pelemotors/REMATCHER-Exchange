const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";

const jar = new Map<string, string>();
function store(res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";");
    const i = p!.indexOf("=");
    if (i > 0) jar.set(p!.slice(0, i), p!.slice(i + 1));
  }
}
function cookie() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), Cookie: cookie() },
  });
  store(res);
  return res;
}

async function main() {
  await api("/login");
  const csrf = (await (await api("/api/auth/csrf")).json()) as {
    csrfToken: string;
  };
  await api("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
  });
  const catchup = await api("/api/cron/lifecycle", { method: "POST" });
  const body = await catchup.text();
  console.log("catchup", catchup.status, body.slice(0, 800));
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as {
    lastLifecycleCatchup: string | null;
    commit: string;
  };
  console.log(
    JSON.stringify({
      commit: health.commit,
      lastLifecycleCatchup: health.lastLifecycleCatchup,
    })
  );
  if (catchup.status !== 200) process.exit(2);
  if (!health.lastLifecycleCatchup) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
