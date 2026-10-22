"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Check, Download, Copy, ShieldAlert } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { api } from "@/lib/api";
import { BUSINESS_PLANS } from "@/lib/tiers";
import ErrorNote from "@/components/ErrorNote";
import Loading from "@/components/ui/Loading";

const field = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 14.5, width: "100%", fontFamily: "inherit" };
const INCLUDES = {
  business: ["Company insights: story volume, themes, unanswered stories", "Alerts when a new story mentions you", "Up to 3 representatives who can reply", "Everything free: right of reply, claims, timeline statements"],
  business_pro: ["Everything in Business", "Industry benchmarks (needs 5+ peers)", "Insights export (CSV)", "Up to 10 representatives", "Priority review of reports about your company"],
  enterprise: ["Everything in Business Pro", "Up to 50 representatives, SSO and custom terms", "A named contact", "Talk to us"],
};

function Console({ id }) {
  const params = useSearchParams();
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [interval, setIv] = useState("year");
  const [invite, setInvite] = useState(null); const [lead, setLead] = useState(null); const [leadSent, setLeadSent] = useState(false); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.getBusiness(id).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  async function buy(plan) { setBusy(true); setErr(null); try { const r = await api.businessCheckout({ companyId: id, plan, interval }); window.location.href = r.url; } catch (e) { setErr(e.message); setBusy(false); } }
  if (err && !d) return <ErrorNote>{err}</ErrorNote>;
  if (!d) return <Loading variant="cards" />;
  const P = d.plan; const active = P.plan !== "none";
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/companies/${id}`} className="inline-flex items-center gap-1" style={{ color: C.muted, textDecoration: "none", fontSize: 13.5 }}><ChevronLeft size={15} /> Company page</Link>
      <h1 style={{ margin: 0, fontSize: 25, fontWeight: 770, color: C.text, letterSpacing: "-0.02em" }}>Company console</h1>
      <div className="lo-card flex gap-3" style={{ padding: 14, borderColor: alpha(C.corpblue, 40) }}><ShieldAlert size={18} color={C.corpblue} style={{ flexShrink: 0, marginTop: 2 }} /><div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}><b>What a plan can never buy.</b> Removing, hiding, editing or ranking stories, or seeing who wrote them. Replying to stories is free for every verified company. Plans add insight and team tools.</div></div>
      {params.get("status") === "success" && <div style={{ background: alpha(C.green, 12), border: `1px solid ${alpha(C.green, 35)}`, borderRadius: 12, padding: "10px 14px", fontSize: 14 }}>Thank you. Your plan activates as soon as payment is confirmed (usually seconds).</div>}
      {err && <ErrorNote>{err}</ErrorNote>}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap"><h2 style={{ margin: 0, fontSize: 18, fontWeight: 730, color: C.text }}>Plans</h2>
          <span style={{ marginLeft: "auto" }} className="flex gap-1.5">{[["month", "Monthly"], ["year", "Annual (save ~12%)"]].map(([k, l]) => <button key={k} onClick={() => setIv(k)} className="lo-btn lo-btn-sm" style={{ background: interval === k ? C.mustard : "transparent", color: interval === k ? "#fff" : C.text2, border: `1px solid ${interval === k ? C.mustard : C.line}` }}>{l}</button>)}</span></div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {Object.entries(BUSINESS_PLANS).map(([k, p]) => (
            <div key={k} className="lo-card flex flex-col gap-2" style={{ padding: 16, borderColor: P.plan === k ? C.mustard : undefined }}>
              <div style={{ fontWeight: 730, fontSize: 17, color: C.text }}>{p.name}{P.plan === k ? " · current" : ""}</div>
              <div style={{ fontSize: 26, fontWeight: 780, color: C.text }}>{p.custom ? "Custom" : `$${(interval === "year" ? p.annualMonthly : p.monthly).toFixed(0)}`}<span style={{ fontSize: 12.5, color: C.muted, fontWeight: 400 }}>{p.custom ? "" : " / month"}</span></div>
              {!p.custom && interval === "year" && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>${p.annual.toFixed(2)} billed yearly</div>}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13.5, color: C.text2 }} className="flex flex-col gap-1">{INCLUDES[k].map((x) => <li key={x}><Check size={13} color={C.green} style={{ display: "inline", marginRight: 6 }} />{x}</li>)}</ul>
              {p.custom ? <button className="lo-btn lo-btn-secondary" onClick={() => setLead({ companyName: "", contactName: "", email: "", teamSize: "", message: "" })}>Contact us</button>
                : <button disabled={busy || P.plan === k} className="lo-btn lo-btn-primary" onClick={() => buy(k)}>{P.plan === k ? "Current plan" : active ? "Switch to this plan" : "Subscribe"}</button>}
            </div>
          ))}
        </div>
        {lead && !leadSent && <div className="lo-card flex flex-col gap-2" style={{ padding: 16 }}>
          {["companyName:Company", "contactName:Your name", "email:Work email", "teamSize:Team size (e.g. 200)"].map((x) => { const [k, l] = x.split(":"); return <input key={k} style={field} placeholder={l} value={lead[k]} onChange={(e) => setLead({ ...lead, [k]: e.target.value })} />; })}
          <textarea rows={3} style={field} placeholder="What do you need?" value={lead.message} onChange={(e) => setLead({ ...lead, message: e.target.value })} />
          <div><button className="lo-btn lo-btn-primary" onClick={async () => { try { await api.enterpriseLead(lead); setLeadSent(true); } catch (e) { setErr(e.message); } }}>Send</button></div>
        </div>}
        {leadSent && <div style={{ fontSize: 14, color: C.green }}>Thanks. We'll be in touch.</div>}
      </section>

      {d.insights && <section className="lo-card flex flex-col gap-3" style={{ padding: 16 }}>
        <div className="flex items-center gap-2"><h2 style={{ margin: 0, fontSize: 18, fontWeight: 730, color: C.text }}>Insights</h2>{P.perks.exports && <a href={`/api/companies/${id}/business?export=csv`} className="lo-btn lo-btn-secondary lo-btn-sm" style={{ marginLeft: "auto" }}><Download size={14} /> CSV</a>}</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>{[["Stories (180 days)", d.insights.stories180], ["Awaiting a reply", d.insights.unanswered], ["Reply rate", d.insights.replyRate == null ? "—" : `${d.insights.replyRate}%`]].map(([l, v]) => <div key={l} style={{ background: C.surface2, borderRadius: 12, padding: 12 }}><div className="lo-eyebrow">{l}</div><div style={{ fontSize: 24, fontWeight: 760, color: C.text }}>{v}</div></div>)}</div>
        <div className="flex items-end gap-1" style={{ height: 70 }} role="img" aria-label="Weekly stories">{d.insights.weekly.map((w) => <div key={w.week} title={`${w.week}: ${w.n}`} style={{ flex: 1, background: C.mustard, borderRadius: 3, height: `${Math.max(6, (w.n / Math.max(1, ...d.insights.weekly.map((x) => x.n))) * 100)}%` }} />)}</div>
        {d.insights.themes.length > 0 && <div style={{ fontSize: 14, color: C.text }}><b>Themes people mention:</b> {d.insights.themes.map((t) => `${t.label} (${t.reports})`).join(", ")}</div>}
        {d.insights.askBeforeJoining.length > 0 && <div style={{ fontSize: 13.5, color: C.muted }}>Candidates will be encouraged to ask: {d.insights.askBeforeJoining.map((q) => q.question).join(" · ")}. Being ready with honest answers is the best response.</div>}
        <div style={{ fontSize: 12.5, color: C.muted }}>{d.insights.note}</div>
      </section>}
      {d.benchmark && <section className="lo-card" style={{ padding: 16, fontSize: 14.5, color: C.text }}><h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 730 }}>Industry benchmark</h2>{d.benchmark.ready ? <>You have <b>{d.benchmark.yourStories}</b> stories vs a median of <b>{d.benchmark.medianPeerStories}</b> across {d.benchmark.peers} {d.benchmark.industry} companies (more than {d.benchmark.percentile}% of peers). <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{d.benchmark.note}</div></> : d.benchmark.note}</section>}

      <section className="lo-card flex flex-col gap-2" style={{ padding: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 730, color: C.text }}>Representatives ({d.reps.length + 1} of {P.perks.reps})</h2>
        <div style={{ fontSize: 13.5, color: C.muted }}>Representatives can reply to stories and publish statements on your company's behalf. They are shown only as “verified company representative”.</div>
        {d.reps.map((r) => <div key={r.handle} className="flex items-center gap-2" style={{ ...monoFont, fontSize: 13, color: C.text2 }}>{r.handle} · {r.role} · added {r.added}<button className="lo-btn lo-btn-ghost lo-btn-sm" style={{ marginLeft: "auto", color: C.flag }} onClick={async () => { await api.businessAction(id, { action: "remove_rep", handle: r.handle }); load(); }}>Remove</button></div>)}
        <div><button className="lo-btn lo-btn-secondary lo-btn-sm" onClick={async () => { try { setInvite(await api.businessAction(id, { action: "invite" })); } catch (e) { setErr(e.message); } }}>Invite a representative</button></div>
        {invite && <div style={{ background: C.surface2, borderRadius: 10, padding: 10, ...monoFont, fontSize: 13, color: C.text }}>Share this code privately (valid {invite.expiresInDays} days, one use): <b>{invite.code}</b> <button className="lo-btn lo-btn-ghost lo-btn-sm" onClick={() => navigator.clipboard?.writeText(invite.code)}><Copy size={13} /></button><div style={{ color: C.muted, marginTop: 4 }}>They redeem it at /redeem-invite.</div></div>}
      </section>
    </div>
  );
}
export default function Page({ params }) { const { id } = use(params); return <Suspense fallback={<Loading variant="cards" />}><Console id={id} /></Suspense>; }
