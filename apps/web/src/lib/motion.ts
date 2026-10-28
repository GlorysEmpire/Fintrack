/** Central motion config. Every animation in the app pulls from here. */
export const durations = { fast: 0.15, base: 0.25, slow: 0.45, hero: 0.8 };

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  spring: { type: "spring" as const, stiffness: 320, damping: 30 },
};
