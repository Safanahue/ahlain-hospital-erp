import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-24 rounded-xl border border-line bg-white p-5 shadow-2xs flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64 rounded-md" />
          <Skeleton className="h-4 w-96 rounded-md" />
        </div>
        <div className="hidden sm:flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex justify-between items-start">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Data Tables Grid Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-line">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-1.5">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-line">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-1.5">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
