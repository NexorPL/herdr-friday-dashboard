// Pure color helpers; `core/` never imports `herdr`.

/** `a` with `ratio` (0 to 1) of `b` mixed in, both "#rrggbb" or "#rrggbbaa"; `a` keeps its own alpha. `a` as it is when either is not that form (a tint is only a help to the eye). */
export function mix(a, b, ratio) {
  const rgb = (c) => (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c ?? "") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * ratio).toString(16).padStart(2, "0")).join("")}${a.slice(7)}`;
}
