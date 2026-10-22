"use client";
import ErrorNote from "@/components/ErrorNote";
import { useState, useEffect } from "react";
import { C, displayFont, monoFont } from "@/lib/theme";
import { adminApi } from "./adminApi";
import { btn, inputStyle, card } from "./ui";

// Gate shown before ANY admin data loads: first-time enrolment (secret → code →
// recovery codes) or the 6-digit code on later sign-ins.
export default function TwoFactor({ enabled, onDone }) {
  const [setup, setSetup] = useState(null), [code, setCode] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [recovery, setRecovery] = useState(null);
  useEffect(() => { if (!enabled) adminApi.post("2fa/setup").then(setSetup).catch((e) => setErr(e.message)); }, [enabled]);

  async function submit(e) {
    e?.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await adminApi.post(enabled ? "2fa/verify" : "2fa/confirm", { code });
      if (r.recoveryCodes) setRecovery(r.recoveryCodes); else onDone();
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }
  async function useKey() {
    setBusy(true); setErr("");
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const o = await adminApi.post("2fa/webauthn-options");
      const response = await startAuthentication({ optionsJSON: o.options });
      await adminApi.post("2fa/webauthn-verify", { response, token: o.token });
      onDone();
    } catch (er) { setErr(er.name === "NotAllowedError" ? "The security key prompt was cancelled." : er.message); } finally { setBusy(false); }
  }
  const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.ink, padding: 16 };

  if (recovery) return (
    <div style={wrap}><div style={{ ...card, maxWidth: 420, width: "100%" }}>
      <h2 style={{ ...displayFont, marginTop: 0 }}>Save your recovery codes</h2>
      <p style={{ color: C.muted, fontSize: 13 }}>Each code works once if you lose your authenticator. They won't be shown again.</p>
      <div style={{ ...monoFont, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, background: C.paper, color: "#111", padding: 12, borderRadius: 8 }}>{recovery.map((r) => <span key={r}>{r}</span>)}</div>
      <button style={{ ...btn("primary"), marginTop: 14, width: "100%", padding: 10 }} onClick={onDone}>I've saved them — continue</button>
    </div></div>
  );
  return (
    <div style={wrap}><form onSubmit={submit} style={{ ...card, maxWidth: 420, width: "100%" }}>
      <h2 style={{ ...displayFont, marginTop: 0 }}>{enabled ? "Two-factor check" : "Set up two-factor authentication"}</h2>
      {enabled ? <p style={{ color: C.muted, fontSize: 13 }}>Enter the 6-digit code from your authenticator app (or a recovery code).</p> : (
        <>
          <p style={{ color: C.muted, fontSize: 13 }}>Staff accounts require 2FA. In your authenticator app (Google Authenticator, 1Password, Authy…) add a time-based account using this key, then enter the code it shows.</p>
          {setup ? <div style={{ ...monoFont, background: C.paper, color: "#111", padding: 10, borderRadius: 8, wordBreak: "break-all", fontSize: 14, marginBottom: 6 }}>{setup.secret}</div> : <p style={{ color: C.muted }}>Generating key…</p>}
          {setup && <a href={setup.uri} style={{ fontSize: 12, color: C.corpblue }}>Open in authenticator app (on this device)</a>}
        </>
      )}
      <input autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, marginTop: 12, fontSize: 18, letterSpacing: 4, textAlign: "center" }} />
      {err && <ErrorNote>{err}</ErrorNote>}
      <button type="submit" disabled={busy || code.trim().length < 6} style={{ ...btn("primary"), marginTop: 12, width: "100%", padding: 10 }}>{enabled ? "Verify" : "Turn on 2FA"}</button>
    {enabled && <button type="button" onClick={useKey} disabled={busy} style={{ ...btn(), marginTop: 8, width: "100%", padding: 10 }}>Use a security key / passkey</button>}
    </form></div>
  );
}
