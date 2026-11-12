export interface RobustnessRow {
  id: string;
  name: string;
  isBaseline: boolean;
  /** Score in real past weather. */
  score: number;
  /** The largest fall in score across the tested scenarios; 0 when it never falls. */
  worstDrop: number;
  /** The scenario that causes it. */
  worstScenario: string | null;
}

/**
 * Score by rotation id for the real past weather and for each stressed scenario. A rotation's drop
 * in a scenario is its score in real weather minus its score there; the worst drop is the largest.
 * Most robust first: the smallest worst drop, then the higher score.
 */
export function rankRobustness(
  history: ReadonlyMap<string, number>,
  stressed: ReadonlyMap<string, ReadonlyMap<string, number>>,
  rotations: readonly { id: string; name: string }[],
  baselineId: string | null,
): RobustnessRow[] {
  const rows: RobustnessRow[] = [];
  for (const { id, name } of rotations) {
    const score = history.get(id);
    if (score === undefined) continue;
    let worstDrop = 0;
    let worstScenario: string | null = null;
    for (const [scenario, scores] of stressed) {
      const there = scores.get(id);
      if (there === undefined) continue;
      const drop = score - there;
      if (drop > worstDrop) {
        worstDrop = drop;
        worstScenario = scenario;
      }
    }
    rows.push({ id, name, isBaseline: id === baselineId, score, worstDrop, worstScenario });
  }
  return rows.sort(
    (a, b) => a.worstDrop - b.worstDrop || b.score - a.score || a.id.localeCompare(b.id),
  );
}
