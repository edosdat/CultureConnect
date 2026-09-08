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
 * Always-on 20px slot above Top 3. Dots fade in here when the list is slow
 * so [data-top3] does not drop (LAYOUT_JUMP). Keep in sync with HomeBootChrome.
 */
export function HomeListWaitSlot({ active = false }: { active?: boolean }) {
  return (
    <div
      data-home-list-wait=""
      className={`pointer-events-none flex ${HOME_LIST_WAIT_SLOT_CLASS} items-center justify-center`}
      aria-hidden={active ? undefined : true}
    >
      {active ? <ListWaitDots /> : null}
    </div>
  );
}
