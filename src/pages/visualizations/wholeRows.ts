// How tall a readings card opens: down to the last whole row of charts that fits, at most maxRows, so a
// chart is never cut in half and the rest stay a scroll away. Null leaves the height to the browser: there
// are no charts yet, or the window can't fit even one row.
export function wholeRowsHeight(plateBottoms: number[], chrome: number, maxHeight: number, maxRows = 2): number | null {
  const rows = [...new Set(plateBottoms.map(Math.ceil))].sort((a, b) => a - b).slice(0, maxRows);
  for (const bottom of rows.reverse()) if (chrome + bottom <= maxHeight) return chrome + bottom;
  return null;
}
