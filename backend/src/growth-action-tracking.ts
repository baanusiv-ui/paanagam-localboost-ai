export const GROWTH_ACTION_STATUSES = ["SUGGESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "DISMISSED"] as const;
export type GrowthActionStatusValue = typeof GROWTH_ACTION_STATUSES[number];

export type TrackedGrowthAction = {
  actionId: string;
  status: GrowthActionStatusValue;
  ownerNote: string | null;
  updatedAt: Date | string;
};

/** Merge persisted owner workflow state without changing generated evidence or recommendations. */
export function mergeGrowthActionTracking<T extends { id: string; status: string }>(
  actions: T[],
  tracked: TrackedGrowthAction[]
): Array<T & { status: GrowthActionStatusValue; ownerNote: string; trackingUpdatedAt: string | null }> {
  const byId = new Map(tracked.map(item => [item.actionId, item]));
  return actions.map(action => {
    const saved = byId.get(action.id);
    return {
      ...action,
      status: saved?.status ?? "SUGGESTED",
      ownerNote: saved?.ownerNote ?? "",
      trackingUpdatedAt: saved ? new Date(saved.updatedAt).toISOString() : null
    };
  });
}
