/** Shared P1 / P2 / P3 ratings for roadmap work (team + partner). */

export type RoadmapPriority = "p1" | "p2" | "p3";

export const ROADMAP_PRIORITIES: RoadmapPriority[] = ["p1", "p2", "p3"];

export const ROADMAP_PRIORITY_LABEL: Record<RoadmapPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export const ROADMAP_PRIORITY_HINT: Record<RoadmapPriority, string> = {
  p1: "Do first",
  p2: "Next",
  p3: "Later",
};

/** Map roadmap rating onto the operational board priority. */
export function boardPriorityForRoadmap(value: RoadmapPriority | null | undefined): "urgent" | "high" | "medium" | "low" {
  if (value === "p1") return "urgent";
  if (value === "p2") return "high";
  if (value === "p3") return "medium";
  return "low";
}

export function normalizeRoadmapPriority(value: unknown): RoadmapPriority | null {
  if (value === "p1" || value === "p2" || value === "p3") return value;
  return null;
}

export function roadmapSortKey(value: RoadmapPriority | null | undefined): number {
  if (value === "p1") return 1;
  if (value === "p2") return 2;
  if (value === "p3") return 3;
  return 9;
}
