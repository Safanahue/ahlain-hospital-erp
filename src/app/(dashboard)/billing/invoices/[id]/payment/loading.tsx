import { Skeleton } from "@/components/ui/skeleton";

export default function CollectPaymentLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-6 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-5">
        <Skeleton className="h-[560px] rounded-xl" />
        <Skeleton className="h-[560px] rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
