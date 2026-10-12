/**
 * A one-shot burst of embers around a streak badge, for the moment the daily
 * goal is reached. Purely decorative: positioned over its (relative) parent,
 * ignores pointer events, and is simply unmounted when the celebration ends.
 */
const EMBERS = Array.from({ length: 10 }, (_, i) => {
  // Spread around the badge but biased upward, the way sparks rise.
  const angle = (-90 + (i - 4.5) * 26) * (Math.PI / 180);
  const distance = 26 + (i % 3) * 9;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance - 6,
    size: 3 + (i % 3),
    delay: (i % 4) * 45,
    color: ["#ffd23f", "#ff8a1f", "#ff4d1a"][i % 3],
  };
});

export function StreakEmbers() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {EMBERS.map((ember, i) => (
        <span
          key={i}
          className="animate-streak-ember absolute rounded-full"
          style={{
            width: ember.size,
            height: ember.size,
            backgroundColor: ember.color,
            boxShadow: `0 0 6px ${ember.color}`,
            animationDelay: `${ember.delay}ms`,
            ["--ember-x" as string]: `${ember.x}px`,
            ["--ember-y" as string]: `${ember.y}px`,
          }}
        />
      ))}
    </span>
  );
}
