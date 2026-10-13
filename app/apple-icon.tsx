import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS "Add to Home Screen". */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e3a8a",
        }}
      >
        <div
          style={{
            width: 90,
            height: 112,
            background: "#fff",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "26px 16px",
          }}
        >
          <div style={{ height: 9, borderRadius: 5, background: "#f59e0b" }} />
          <div style={{ height: 9, borderRadius: 5, background: "#cbd5e1" }} />
          <div style={{ height: 9, width: 40, borderRadius: 5, background: "#cbd5e1" }} />
        </div>
      </div>
    ),
    size,
  );
}
