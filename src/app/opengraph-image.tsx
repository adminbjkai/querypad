import { ImageResponse } from "next/og";

export const alt = "QueryPad — drop in data files, see how they connect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1b2433";
const PAPER = "#eef1f4";
const JOIN = "#b86e00";
const ACCENT = "#1a6ce7";

function Table({ name, cols, x, y }: { name: string; cols: [string, string][]; x: number; y: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 300,
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        border: `3px solid ${INK}`,
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", padding: "14px 18px", borderBottom: `3px solid ${INK}`, fontSize: 28, fontWeight: 700, color: INK }}>
        {name}
      </div>
      {cols.map(([col, glyph]) => (
        <div key={col} style={{ display: "flex", gap: 14, padding: "8px 18px", fontSize: 24, color: INK }}>
          <span style={{ color: glyph === "#" ? "#1d7a86" : "#6a4fc9", width: 30 }}>{glyph}</span>
          {col}
        </div>
      ))}
    </div>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, position: "relative", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", left: 80, top: 96, display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: INK }}>QueryPad</div>
          <div style={{ marginTop: 28, fontSize: 64, lineHeight: 1.05, fontWeight: 700, color: INK, letterSpacing: -2 }}>
            Drop in data files. See how they connect.
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: "#5c6878" }}>
            DuckDB in your browser. SQL or plain English.
          </div>
        </div>
        <Table name="orders" cols={[["id", "#"], ["customer_id", "#"], ["total", "#"]]} x={700} y={110} />
        <Table name="customers" cols={[["id", "#"], ["name", "Aa"], ["plan", "Aa"]]} x={820} y={340} />
        <div style={{ position: "absolute", left: 660, top: 236, width: 60, height: 190, borderLeft: `5px solid ${JOIN}`, borderTop: `5px solid ${JOIN}`, borderBottom: `5px solid ${JOIN}`, borderRadius: "18px 0 0 18px" }} />
        <div style={{ position: "absolute", left: 80, bottom: 70, width: 120, height: 8, background: ACCENT, borderRadius: 4 }} />
      </div>
    ),
    size
  );
}
