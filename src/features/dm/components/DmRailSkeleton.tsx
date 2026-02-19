import { memo } from "react";

type DmRailSkeletonProps = {
  animated?: boolean;
};

function DmRailSkeleton({ animated = true }: DmRailSkeletonProps) {
  return (
    <div className="dm-rail-skeleton-list" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={`dm-skeleton-${idx}`}
          className="dm-rail-skeleton-row"
          style={{ opacity: Math.max(0.26, 0.88 - idx * 0.14) }}
        >
          <div className={`dm-rail-skeleton-avatar ${animated ? "is-animated" : ""}`} />
          <div className="dm-rail-skeleton-lines">
            <div
              className={`dm-rail-skeleton-line dm-rail-skeleton-line-main ${animated ? "is-animated" : ""}`}
            />
            <div
              className={`dm-rail-skeleton-line dm-rail-skeleton-line-sub ${animated ? "is-animated" : ""}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(DmRailSkeleton);
