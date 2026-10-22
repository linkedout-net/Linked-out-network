"use client";
import { AlertCircle } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";

// Calm, compact inline notice used for every user-facing error. Neutral
// surface with a small icon instead of long red sentences. Long or technical
// text is trimmed so people never see a wall of detail.
function brief(text) {
  const t = String(text ?? "").trim();
  if (!t) return "Something went wrong. Please try again.";
  // Keep up to two short sentences so a helpful hint (e.g. "Upgrade to …") isn't cut off, but never a wall of text.
  const parts = t.split(/(?<=[.!?])\s/);
  let out = parts[0];
  if (parts[1] && (out + " " + parts[1]).length <= 200) out += " " + parts[1];
  return out.length > 200 ? out.slice(0, 197).trimEnd() + "…" : out;
}

export default function ErrorNote({ children, compact = false }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        background: C.surface2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${alpha(C.mustard, 90)}`,
        borderRadius: 8, padding: compact ? "6px 10px" : "8px 12px",
        color: C.text, fontSize: 12, lineHeight: 1.35, ...monoFont,
      }}
    >
      <AlertCircle size={14} style={{ color: C.muted, flexShrink: 0, marginTop: 1 }} />
      <span>{brief(typeof children === "string" ? children : Array.isArray(children) ? children.join("") : children)}</span>
    </div>
  );
}
