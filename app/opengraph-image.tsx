import { ImageResponse } from "next/og";
export const alt = "MarketScannerPros — market research tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
/** Static branding: no provider request or dependency on a stored market snapshot. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#0F172A",
        color: "#F8FAFC",
        padding: 80,
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700 }}>MarketScannerPros</div>
      <div style={{ fontSize: 34, marginTop: 28 }}>
        Market research, in one workspace.
      </div>
      <div style={{ fontSize: 24, marginTop: 60, color: "#CBD5E1" }}>
        Research and education only. Not financial advice.
      </div>
    </div>,
    size,
  );
}
