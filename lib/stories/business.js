// Business plans (companies). What a company can buy: insight and response tooling.
// What it can NEVER buy: removal, hiding, editing, ranking, or the identity of any author.
import crypto from "node:crypto";
import { contentDb, formatRelativeTime } from "../content/db.js";
import { storiesIdentityReady, identityDb } from "./identity-db.js";
import { businessPerks } from "../tiers.js";
import { StoryError, companyReality } from "./service.js";
import { rowThemes, THEMES } from "./themes.js";

const nowIso = () => new Date().toISOString();
const DAY = 864e5;
const hashCode = (c) => crypto.createHash("sha256").update(`rep:${c}:${process.env.IDENTITY_SIGNING_SECRET || "dev"}`).digest("hex");

export async function planOf(companyId) {
  const r = await contentDb.prepare("SELECT * FROM company_plans WHERE company_id = ?").get(companyId);
  const active = r && r.status === "active" && (!r.current_period_end || r.current_period_end > nowIso());
  return { plan: active ? r.plan : "none", status: r?.status || "inactive", interval: r?.billing_interval || null, renews: r?.current_period_end || null, perks: businessPerks(active ? r.plan : "none") };
}
export async function setCompanyPlan({ companyId, plan, status, interval, customerId, subscriptionId, periodEnd }) {
  await contentDb.prepare(
    `INSERT INTO company_plans (company_id, plan, status, billing_interval, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (company_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, billing_interval = COALESCE(EXCLUDED.billing_interval, company_plans.billing_interval),
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, company_plans.stripe_customer_id), stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, company_plans.stripe_subscription_id),
       current_period_end = EXCLUDED.current_period_end, updated_at = EXCLUDED.updated_at`
  ).run(companyId, plan, status, interval || null, customerId || null, subscriptionId || null, periodEnd || null, nowIso());
}

async function ownerOrRep(companyId, key) {
  const c = await contentDb.prepare("SELECT id, name, industry, owner_key, verification FROM companies WHERE id = ? AND status = 'active'").get(companyId);
  if (!c) throw new StoryError("Company not found.", 404, "NOT_FOUND");
  const rep = c.owner_key === key ? { role: "owner" } : await contentDb.prepare("SELECT role FROM company_reps WHERE company_id = ? AND anon_key = ?").get(companyId, key);
  if (!rep) throw new StoryError("Only the company's representatives can see this.", 403, "NOT_OWNER");
  return { c, role: rep.role };
}
export async function assertOwner(companyId, key) { const r = await ownerOrRep(companyId, key); if (r.role !== "owner") throw new StoryError("Only the page owner can do that.", 403, "NOT_OWNER"); return r.c; }

// Insights: aggregate only. Counts of stories and themes; never an author, a timestamp finer than a day, or an alias.
export async function insights(companyId, key) {
  const { c } = await ownerOrRep(companyId, key);
  const p = await planOf(companyId);
  if (!p.perks.insights) throw new StoryError("Company insights are part of a Business plan.", 403, "PLAN_REQUIRED");
  const rows = await contentDb.prepare("SELECT id, format, title, body, told, actual, impact, themes, created_at, anonymous_id FROM stories WHERE status='published' AND (company_id = ? OR company_key = ?) AND created_at > ?").all(companyId, c.name.toLowerCase().replace(/[^a-z0-9]+/g, ""), new Date(Date.now() - 180 * DAY).toISOString());
  const weeks = {}; for (const r of rows) { const d = new Date(r.created_at); const w = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); weeks[w] = (weeks[w] || 0) + 1; }
  const themeCounts = {}; for (const r of rows) for (const t of rowThemes(r)) { (themeCounts[t] ||= new Set()).add(r.anonymous_id); }
  const replied = new Set((await contentDb.prepare("SELECT story_id FROM company_responses WHERE company_id = ? AND story_id IS NOT NULL").all(companyId)).map((x) => x.story_id));
  const unanswered = rows.filter((r) => !replied.has(r.id) && ["laid_off", "fired", "management", "red_flag", "salary", "warning", "whistleblower"].includes(r.format)).length;
  const reality = await companyReality(companyId, { viewerKey: key, tier: "pro" });
  return {
    plan: p.plan, stories180: rows.length, unanswered, replyRate: rows.length ? Math.round((replied.size / rows.length) * 100) : null,
    weekly: Object.entries(weeks).sort().slice(-26).map(([week, n]) => ({ week, n })),
    themes: THEMES.filter((t) => themeCounts[t.key]?.size >= 2).map((t) => ({ key: t.key, label: t.label, reports: themeCounts[t.key].size })).sort((a, b) => b.reports - a.reports),
    patterns: reality.patterns, askBeforeJoining: reality.askBeforeJoining, claims: reality.claims.map((x) => ({ claim: x.claim, status: x.truthGap.label })),
    note: "Aggregates only. You can reply to any story, but you cannot see who wrote it, hide it or edit it.",
  };
}

// Benchmark (Business Pro): how this company's story volume and themes compare with its industry, only with >= 5 peers.
export async function benchmark(companyId, key) {
  const { c } = await ownerOrRep(companyId, key);
  const p = await planOf(companyId);
  if (!p.perks.benchmark) throw new StoryError("Industry benchmarks are part of Business Pro.", 403, "PLAN_REQUIRED");
  if (!c.industry) return { ready: false, note: "Add your industry on the company page to see benchmarks." };
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const peers = await contentDb.prepare(
    `SELECT s.company_id, COUNT(*) n FROM stories s JOIN companies x ON x.id = s.company_id WHERE s.status='published' AND x.industry = ? AND x.id <> ? AND s.created_at > ? GROUP BY s.company_id`
  ).all(c.industry, companyId, since);
  if (peers.length < 5) return { ready: false, note: `Benchmarks need at least 5 other ${c.industry} companies with stories. Right now there are ${peers.length}.` };
  const mine = Number((await contentDb.prepare("SELECT COUNT(*) n FROM stories WHERE status='published' AND company_id = ? AND created_at > ?").get(companyId, since)).n);
  const counts = peers.map((x) => Number(x.n)).sort((a, b) => a - b);
  const below = counts.filter((n) => n < mine).length;
  return { ready: true, industry: c.industry, peers: peers.length, yourStories: mine, medianPeerStories: counts[Math.floor(counts.length / 2)], percentile: Math.round((below / counts.length) * 100), note: "Compared with other companies in your industry over 180 days. Volume reflects how many people chose to share, not how good or bad a workplace is." };
}

export async function exportCompanyCsv(companyId, key) {
  const { c } = await ownerOrRep(companyId, key);
  const p = await planOf(companyId);
  if (!p.perks.exports) throw new StoryError("Exports are part of Business Pro.", 403, "PLAN_REQUIRED");
  const i = await insights(companyId, key);
  const lines = ["section,label,value", ...i.weekly.map((w) => `weekly stories,${w.week},${w.n}`), ...i.themes.map((t) => `theme reports,"${t.label}",${t.reports}`), `summary,unanswered stories,${i.unanswered}`, `summary,reply rate %,${i.replyRate ?? ""}`];
  return { filename: `${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-linkedout-insights.csv`, csv: lines.join("\n") };
}

// ---- representatives (the page owner invites; reps can reply, nothing more) ----
export async function createInvite(companyId, key) {
  const c = await assertOwner(companyId, key); const p = await planOf(companyId);
  const reps = Number((await contentDb.prepare("SELECT COUNT(*) n FROM company_reps WHERE company_id = ?").get(companyId)).n) + 1;
  if (reps >= p.perks.reps) throw new StoryError(`Your plan allows ${p.perks.reps} representative${p.perks.reps === 1 ? "" : "s"} including the owner.`, 403, "PLAN_LIMIT");
  const code = crypto.randomBytes(9).toString("base64url");
  await contentDb.prepare("INSERT INTO company_rep_invites (code_hash, company_id, created_by, expires_at) VALUES (?,?,?,?)").run(hashCode(code), c.id, key, new Date(Date.now() + 3 * DAY).toISOString());
  return { code, expiresInDays: 3 };
}
export async function redeemInvite(code, key) {
  const inv = await contentDb.prepare("SELECT * FROM company_rep_invites WHERE code_hash = ?").get(hashCode(String(code || "").trim()));
  if (!inv || inv.used_at || inv.expires_at < nowIso()) throw new StoryError("That invite is invalid or expired.", 400, "BAD_INVITE");
  await contentDb.prepare("INSERT INTO company_reps (company_id, anon_key, role, created_at) VALUES (?,?, 'responder', ?) ON CONFLICT DO NOTHING").run(inv.company_id, key, nowIso());
  await contentDb.prepare("UPDATE company_rep_invites SET used_at = ? WHERE code_hash = ?").run(nowIso(), inv.code_hash);
  return { companyId: inv.company_id };
}
export async function listReps(companyId, key) {
  await ownerOrRep(companyId, key);
  return (await contentDb.prepare("SELECT anon_key, role, created_at FROM company_reps WHERE company_id = ? ORDER BY created_at").all(companyId))
    .map((r) => ({ handle: `rep-${crypto.createHash("sha256").update(`${companyId}:${r.anon_key}`).digest("hex").slice(0, 6)}`, role: r.role, added: formatRelativeTime(r.created_at) }));
}
export async function removeRep(companyId, key, handle) {
  await assertOwner(companyId, key);
  for (const r of await contentDb.prepare("SELECT anon_key FROM company_reps WHERE company_id = ?").all(companyId)) {
    if (`rep-${crypto.createHash("sha256").update(`${companyId}:${r.anon_key}`).digest("hex").slice(0, 6)}` === handle) await contentDb.prepare("DELETE FROM company_reps WHERE company_id = ? AND anon_key = ?").run(companyId, r.anon_key);
  }
  return { ok: true };
}

// ---- enterprise leads (contact form; stored account-side with the email) ----
export async function createLead({ companyName, contactName, email, teamSize, message }) {
  await storiesIdentityReady();
  const n = String(companyName || "").trim().slice(0, 120); const e = String(email || "").trim().toLowerCase().slice(0, 160);
  if (n.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new StoryError("Add your company name and a work email.");
  await identityDb.prepare("INSERT INTO enterprise_leads (id, company_name, contact_name, email, team_size, message, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), n, String(contactName || "").slice(0, 100) || null, e, String(teamSize || "").slice(0, 40) || null, String(message || "").slice(0, 1500) || null, nowIso());
  return { ok: true };
}
