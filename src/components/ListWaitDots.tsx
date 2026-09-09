import { HOME_LIST_WAIT_SLOT_CLASS } from '@/lib/displayHome';

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

/**
 * Overlay above Top 3. Dots fade in when the list is slow without reserving
 * a well (LAYOUT_JUMP). Parent must be `relative`. Keep in sync with boot.
 */
export function HomeListWaitSlot({ active = false }: { active?: boolean }) {
  return (
    <div
      data-home-list-wait=""
      className={`pointer-events-none ${HOME_LIST_WAIT_SLOT_CLASS}`}
      aria-hidden={active ? undefined : true}
    >
      {active ? <ListWaitDots /> : null}
    </div>
  );
}
