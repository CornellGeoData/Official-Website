// Which level each donation marker sits on, so no two touch. Markers go left to right, each
// taking the lowest level where it clears the last marker there, so one lifts only when it must.
export function flagLevels(centers: number[], flagWidth: number, gap = 6): number[] {
  const rightEdges: number[] = [];
  return centers.map((center) => {
    const left = center - flagWidth / 2;
    let level = rightEdges.findIndex((edge) => left >= edge + gap);
    if (level === -1) level = rightEdges.length;
    rightEdges[level] = center + flagWidth / 2;
    return level;
  });
}
