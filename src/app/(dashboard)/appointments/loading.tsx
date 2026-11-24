import { Skeleton } from "@/components/ui/skeleton";

export default function AppointmentsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-32 rounded-xl" />
        <Skeleton className="h-4 w-40 rounded-xl" />
      </div>
      <div className="card p-4">
        <Skeleton className="h-10 w-full max-w-md rounded-xl" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        <Skeleton className="mt-2 h-10 w-full rounded-xl" />
        <Skeleton className="mt-2 h-10 w-full rounded-xl" />
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
