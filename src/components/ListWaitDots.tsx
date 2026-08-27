/** 3 terracotta dots under the agenda counter — list fetch >1s only. */
export default function ListWaitDots() {
  return (
    <div
      className="cc-wait-dots"
      role="status"
      aria-live="polite"
      aria-label="Chargement"
    >
      <span className="cc-wait-dot" />
      <span className="cc-wait-dot" />
      <span className="cc-wait-dot" />
    </div>
  );
}
