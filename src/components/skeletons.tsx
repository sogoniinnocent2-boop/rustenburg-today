export function Bone({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="glass-card space-y-3 p-5" aria-hidden="true">
      <Bone className="h-3 w-24" />
      <Bone className="h-8 w-4/5" />
      <Bone className="h-4 w-full" />
      <Bone className="h-4 w-2/3" />
      <Bone className="mt-2 h-3 w-28" />
    </div>
  );
}

export function GridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="glass-card max-w-3xl space-y-3 p-6">
        <Bone className="h-3 w-32" />
        <Bone className="h-10 w-3/5" />
        <Bone className="h-4 w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => <CardSkeleton key={index} />)}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <Bone className="h-80 w-full rounded-[2rem]" />
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Bone className="h-12 w-full rounded-full" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="glass-card space-y-2 p-4">
          <Bone className="h-3 w-20" />
          <Bone className="h-7 w-2/3" />
          <Bone className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]" aria-busy="true" aria-live="polite">
      <div className="glass-card space-y-2 p-3">
        {Array.from({ length: 6 }, (_, index) => <Bone key={index} className="h-8 w-full" />)}
      </div>
      <div className="space-y-3">
        <Bone className="h-16 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          <Bone className="h-24" />
          <Bone className="h-24" />
        </div>
        <Bone className="h-40" />
      </div>
    </div>
  );
}
