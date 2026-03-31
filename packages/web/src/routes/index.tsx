import { createFileRoute } from "@tanstack/react-router";
import { HealthCard } from "@/components/bycc/HealthCard";
import { QuotaCard } from "@/components/bycc/QuotaCard";
import { ByccService } from "@/services/services.generated";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthError,
  } = ByccService.useHealth();
  const { data: statsData, isLoading: statsLoading } = ByccService.useStats();

  return (
    <div className="space-y-5 max-w-300 mx-auto -translate-x-4">
      <h1 className="text-xl font-medium text-sand-900 tracking-tight">Dashboard</h1>

      <HealthCard data={healthData} isLoading={healthLoading} isError={healthError} />

      <div>
        <span className="text-[10px] uppercase tracking-wider text-sand-500 font-medium">
          Token Quota (5h window)
        </span>
        <div className="mt-2">
          <QuotaCard data={statsData} isLoading={statsLoading} />
        </div>
      </div>
    </div>
  );
}
