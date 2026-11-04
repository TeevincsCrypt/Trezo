import { formatDistance } from "./geo";

export function metricLabel(metric: string | null, v: number) {
  if (metric === "distance") return formatDistance(v);
  if (metric === "community_treasure") return v.toLocaleString();
  return String(v);
}
