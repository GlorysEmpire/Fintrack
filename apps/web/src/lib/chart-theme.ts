/** Chart.js draws on a canvas, so it can't use CSS classes: read the theme tokens at draw time. */
export type ChartTheme = {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  border: string;
  income: string;
  expense: string;
  font: string;
};

export function readChartTheme(): ChartTheme {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    text: v("--color-foreground"),
    muted: v("--color-muted-foreground"),
    grid: v("--color-border"),
    surface: v("--color-card"),
    border: v("--color-border"),
    income: v("--color-primary"),
    expense: v("--color-destructive"),
    font: getComputedStyle(document.body).fontFamily,
  };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
