import { createSign, generateKeyPairSync, randomUUID } from "crypto";
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i);
  const v = t.slice(i + 1);
  if (!(k in process.env)) process.env[k] = v;
}

const apiKey = process.env.BUNQ_API_KEY?.trim();
const env = (process.env.BUNQ_ENVIRONMENT || "production").trim();
const base =
  env === "sandbox"
    ? "https://public-api.sandbox.bunq.com/v1"
    : "https://api.bunq.com/v1";
const permitted = (process.env.BUNQ_PERMITTED_IPS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  if (!apiKey) {
    console.error("NO_KEY");
    process.exit(1);
  }
  console.log("env=", env, "keyLen=", apiKey.length, "base=", base);

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  function sign(body: string) {
    const s = createSign("RSA-SHA256");
    s.update(body);
    s.end();
    return s.sign(privateKey, "base64");
  }

  async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; sign?: boolean } = {},
  ) {
    const bodyStr = opts.body === undefined ? "" : JSON.stringify(opts.body);
    const headers: Record<string, string> = {
      "Cache-Control": "no-cache",
      "User-Agent": "blablabuild-revops-test/1.0",
      "X-Bunq-Language": "en_US",
      "X-Bunq-Region": "nl_NL",
      "X-Bunq-Client-Request-Id": randomUUID(),
      "X-Bunq-Geolocation": "0 0 0 0 000",
    };
    if (bodyStr) headers["Content-Type"] = "application/json";
    if (opts.token) headers["X-Bunq-Client-Authentication"] = opts.token;
    if (opts.sign && bodyStr) headers["X-Bunq-Client-Signature"] = sign(bodyStr);
    const res = await fetch(base + path, {
      method,
      headers,
      body: bodyStr || undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return { status: res.status, json, text: text.slice(0, 500) };
  }

  function pick(resp: unknown, key: string) {
    const response = (resp as { Response?: Record<string, unknown>[] })?.Response || [];
    for (const item of response) if (key in item) return item[key] as Record<string, unknown>;
    return null;
  }

  const inst = await call("POST", "/installation", {
    body: { client_public_key: publicKey },
  });
  console.log("installation status=", inst.status);
  if (inst.status >= 400) {
    console.log(inst.text);
    process.exit(1);
  }
  const installationToken = (pick(inst.json, "Token") as { token?: string } | null)?.token;
  if (!installationToken) {
    console.log("no installation token", inst.text);
    process.exit(1);
  }
  console.log("installation OK");

  const device = await call("POST", "/device-server", {
    token: installationToken,
    sign: true,
    body: {
      description: "blablabuild revops test",
      secret: apiKey,
      permitted_ips: permitted,
    },
  });
  console.log("device-server status=", device.status);
  if (device.status >= 400) {
    console.log(device.text);
    process.exit(1);
  }
  console.log("device OK id=", (pick(device.json, "Id") as { id?: number } | null)?.id);

  const session = await call("POST", "/session-server", {
    token: installationToken,
    sign: true,
    body: { secret: apiKey },
  });
  console.log("session-server status=", session.status);
  if (session.status >= 400) {
    console.log(session.text);
    process.exit(1);
  }
  const sessionToken = (pick(session.json, "Token") as { token?: string } | null)?.token;
  const user =
    pick(session.json, "UserPerson") ||
    pick(session.json, "UserCompany") ||
    pick(session.json, "UserApiKey");
  const userId =
    (user as { id?: number } | null)?.id ||
    (user as { granted_by_user?: { UserPerson?: { id: number }; UserCompany?: { id: number } } } | null)
      ?.granted_by_user?.UserPerson?.id ||
    (user as { granted_by_user?: { UserCompany?: { id: number } } } | null)?.granted_by_user
      ?.UserCompany?.id;
  console.log("session OK userId=", userId);

  const accounts = await call("GET", `/user/${userId}/monetary-account?count=50`, {
    token: sessionToken,
  });
  console.log("accounts status=", accounts.status);
  if (accounts.status >= 400) {
    console.log(accounts.text);
    process.exit(1);
  }
  const list = (
    ((accounts.json as { Response?: Record<string, unknown>[] })?.Response || []).map(
      (x) =>
        x.MonetaryAccountBank ||
        x.MonetaryAccountJoint ||
        x.MonetaryAccountLight ||
        x.MonetaryAccountSavings,
    ) as Array<{
      id: number;
      description?: string;
      status?: string;
      balance?: { value: string; currency: string };
      alias?: Array<{ type?: string; value?: string }>;
    } | undefined>
  ).filter(Boolean);

  console.log("accounts=", list.length);
  for (const a of list.slice(0, 5)) {
    if (!a) continue;
    const iban = (a.alias || []).find((x) => x.type === "IBAN")?.value;
    console.log(
      "-",
      a.id,
      a.description,
      a.status,
      iban,
      "balance=",
      a.balance?.value,
      a.balance?.currency,
    );
  }
  console.log("BUNQ_AUTH_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
