'use client';

type Props = {
  onDismiss: () => void;
  pressed?: boolean;
  className?: string;
};

/**
 * Discrete « pas pour moi » (P3). Soft Design will restyle.
 * aria-label is the unambiguous name; the glyph stays quiet.
 */
export default function PasPourMoiControl({
  onDismiss,
  pressed = false,
  className = '',
}: Props) {
  return (
    <button
      type="button"
      data-testid="pas-pour-moi"
      data-signal-kind="not_interested"
      aria-label="Pas pour moi"
      aria-pressed={pressed}
      title="Pas pour moi"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
      className={
        'z-[2] inline-flex h-7 w-7 items-center justify-center rounded-full bg-culture-surface/80 text-sm leading-none text-culture-muted shadow-sm hover:bg-culture-surface hover:text-culture-ink ' +
        className
      }
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
