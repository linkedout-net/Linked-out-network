import { cookies, headers } from "next/headers";
import { identityDb } from "@/lib/identity/db";
import { signToken, verifyToken } from "@/lib/identity/crypto";
import { seal, unseal, verifyTotp, newSecret, otpauthUri, newRecoveryCodes, hashCode } from "./totp";

// Staff must pass a second factor before ANY /api/admin data call works.
// After a correct code the server issues a signed "lo_2fa" token bound to the
// account (12 h). Web gets it as an httpOnly cookie; native keeps the token and
// sends it as `X-Admin-2FA`. Staff who haven't enrolled are forced to enrol.
const TTL = 12 * 3600 * 1000;
export const issue2faToken = (accountId) => signToken({ t: "2fa", a: accountId, exp: Date.now() + TTL });

export async function twoFactorState(accountId) {
  const r = await identityDb.prepare("SELECT totp_enabled FROM accounts WHERE id = ?").get(accountId);
  const enabled = !!r?.totp_enabled;
  const store = await cookies(), h = await headers();
  const tok = store.get("lo_2fa")?.value || h.get("x-admin-2fa");
  const p = tok && verifyToken(tok);
  return { enabled, verified: enabled && !!p && p.t === "2fa" && p.a === accountId };
}

export async function beginSetup(staff) {
  const secret = newSecret();
  await identityDb.prepare("UPDATE accounts SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").run(seal(secret), staff.id);
  return { secret, uri: otpauthUri(secret, staff.email || staff.pseudonym || staff.id) };
}

export async function confirmSetup(staff, code) {
  const r = await identityDb.prepare("SELECT totp_secret, totp_enabled FROM accounts WHERE id = ?").get(staff.id);
  if (!r?.totp_secret) throw Object.assign(new Error("Start setup first."), { status: 400 });
  if (r.totp_enabled) throw Object.assign(new Error("2FA is already on."), { status: 400 });
  if (!verifyTotp(unseal(r.totp_secret), code)) throw Object.assign(new Error("That code is wrong or expired."), { status: 400 });
  const codes = newRecoveryCodes();
  await identityDb.prepare("UPDATE accounts SET totp_enabled = 1, totp_recovery = ? WHERE id = ?").run(JSON.stringify(codes.map(hashCode)), staff.id);
  return { recoveryCodes: codes, token: issue2faToken(staff.id) };
}

export async function verifyLogin(staff, code) {
  const r = await identityDb.prepare("SELECT totp_secret, totp_enabled, totp_recovery FROM accounts WHERE id = ?").get(staff.id);
  if (!r?.totp_enabled) throw Object.assign(new Error("2FA isn't set up."), { status: 400 });
  const clean = String(code || "").trim().toLowerCase();
  if (verifyTotp(unseal(r.totp_secret), clean)) return issue2faToken(staff.id);
  const list = JSON.parse(r.totp_recovery || "[]"), h = hashCode(clean);
  if (list.includes(h)) { // single-use recovery code
    await identityDb.prepare("UPDATE accounts SET totp_recovery = ? WHERE id = ?").run(JSON.stringify(list.filter((x) => x !== h)), staff.id);
    return issue2faToken(staff.id);
  }
  import("@/lib/security/core").then((m) => m.noteMfaFailure(staff.id)).catch(() => {});
  throw Object.assign(new Error("That code is wrong or expired."), { status: 401 });
}
export const resetTwoFactor = (accountId) => identityDb.prepare("UPDATE accounts SET totp_secret=NULL, totp_enabled=0, totp_recovery=NULL WHERE id = ?").run(accountId);
