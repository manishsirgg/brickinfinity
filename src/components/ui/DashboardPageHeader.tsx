import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DashboardPageHeader({
  title,
  description,
  showBackToDashboard = true,
  actions,
}: {
  title: string;
  description?: string;
  showBackToDashboard?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {showBackToDashboard && (
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 md:w-auto"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          )}
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">{title}</h1>
          {description && <p className="text-sm text-slate-600 md:text-base">{description}</p>}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
