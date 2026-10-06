import { BrandMark } from "./BrandMark";

/** Skeleton shaped like the workspace, so the layout doesn't jump when it loads. */
function LayoutSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[52px] shrink-0 flex-col items-center gap-3 border-r border-line bg-chrome py-3 md:w-[228px] md:items-stretch md:px-3">
          <div className="flex items-center gap-2">
            <BrandMark size={20} />
            <div className="qp-skeleton hidden h-4 w-20 md:block" />
          </div>
          <div className="qp-skeleton h-8 w-8 md:w-full" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="qp-skeleton h-5 w-6 md:w-3/4" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
            <div className="qp-skeleton h-4 w-40" />
            <div className="ml-auto qp-skeleton h-7 w-20" />
          </div>
          <div className="flex h-9 shrink-0 items-end gap-1 border-b border-line bg-chrome px-2 pb-1.5">
            <div className="qp-skeleton h-5 w-24" />
          </div>
          <div className="flex h-[38%] flex-col gap-2.5 border-b border-line p-4">
            {[60, 82, 44, 70, 30].map((w, i) => (
              <div key={i} className="qp-skeleton h-3" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="flex flex-col">
            <div className="flex h-8 items-center gap-6 border-b border-line bg-raised px-4">
              {[18, 12, 16, 10].map((w, i) => (
                <div key={i} className="qp-skeleton h-3" style={{ width: `${w}%` }} />
              ))}
            </div>
            {Array.from({ length: 7 }, (_, r) => (
              <div key={r} className="flex h-7 items-center gap-6 border-b border-line px-4">
                {[18, 12, 16, 10].map((w, i) => (
                  <div key={i} className="qp-skeleton h-2.5" style={{ width: `${w - (r % 3)}%` }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="relative flex h-dvh flex-col bg-paper text-ink">
      <LayoutSkeleton />
      <div className="absolute inset-0 flex items-end justify-center p-6 pb-10 sm:items-center sm:pb-6">
        <div
          role={tone === "error" ? "alert" : "status"}
          className="max-w-sm rounded-lg border border-line bg-surface px-4 py-3 text-center shadow-pop"
        >
          <p className={`text-[13px] font-medium ${tone === "error" ? "text-danger" : "text-ink"}`}>{message}</p>
          {detail && <p className="mt-1 text-[12px] leading-4 text-muted">{detail}</p>}
          <div className="relative mx-auto mt-2.5 h-0.5 w-32 overflow-hidden rounded-full bg-line">
            {tone === "info" && <span className="qp-scan absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />}
            {tone === "error" && <span className="absolute inset-0 bg-danger" />}
          </div>
        </div>
      </div>
    </div>
  );
}
