import { Skeleton } from "@/components/ui/skeleton";

export default function ReconciliationLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
