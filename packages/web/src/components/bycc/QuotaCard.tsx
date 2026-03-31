import type { TokenStats } from "@/services/bycc/bycc.types";
import { StatusBadge } from "./StatusBadge";

interface QuotaCardProps {
  data: TokenStats[] | undefined;
  isLoading: boolean;
}

function formatResetsIn(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function barColor(percent: number): string {
  if (percent >= 95) return "bg-red-500";
  if (percent >= 80) return "bg-amber-400";
  return "bg-sienna-400";
}

function textColor(percent: number): string {
  if (percent >= 95) return "text-red-500";
  if (percent >= 80) return "text-amber-500";
  return "text-sand-700";
}

export function QuotaCard({ data, isLoading }: QuotaCardProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="rounded-lg bg-sand-50 px-5 py-4 animate-pulse">
            <div className="h-3 w-24 bg-sand-200 rounded mb-3" />
            <div className="h-2 w-full bg-sand-200 rounded-full mb-2" />
            <div className="h-3 w-40 bg-sand-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const tokens = data ?? [];
  const tokensWithQuota = tokens.filter((t) => t.quota);

  if (tokensWithQuota.length === 0) {
    return (
      <div className="rounded-lg bg-sand-50 px-5 py-4">
        <span className="text-[10px] uppercase tracking-wider text-sand-500 font-medium">
          Token Quota
        </span>
        <p className="text-sand-400 text-sm mt-2">No quota data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tokensWithQuota.map((token) => {
        const q = token.quota ?? { total: 0, percent: 0, resetsIn: 0, requests: 0, costUsd: 0 };
        return (
          <div key={token.token} className="rounded-lg bg-sand-50 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-sand-800">{token.name || "Unnamed"}</span>
                <StatusBadge active={token.active} />
              </div>
              <span className={`text-sm font-semibold tabular-nums ${textColor(q.percent)}`}>
                {q.percent}%
              </span>
            </div>

            <div className="h-2 w-full bg-sand-200 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor(q.percent)}`}
                style={{ width: `${Math.min(q.percent, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-sand-500">
              <span className="tabular-nums">{q.requests} req</span>
              <span>resets in {formatResetsIn(q.resetsIn)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
