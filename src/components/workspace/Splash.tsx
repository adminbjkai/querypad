import { BrandMark } from "./BrandMark";

/** Full-screen state while DuckDB boots or the workspace restores. */
export default function Splash({
  message,
  detail,
  tone = "info",
}: {
  message: string;
  detail?: string;
  tone?: "info" | "error";
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-paper p-6 text-ink">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <BrandMark size={36} />
        <div className="relative h-0.5 w-40 overflow-hidden rounded-full bg-line">
          {tone === "info" && <span className="qp-scan absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />}
          {tone === "error" && <span className="absolute inset-0 bg-danger" />}
        </div>
        <p className={`text-sm font-medium ${tone === "error" ? "text-danger" : "text-ink"}`}>{message}</p>
        {detail && <p className="text-[13px] leading-5 text-muted">{detail}</p>}
      </div>
    </div>
  );
}
