import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: DOMRect;
  className: string;
  onClose: () => void;
  children: ReactNode;
}

// React events bubble through portals, so keep them from reaching the card's drag/edit handlers.
const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Floating panel under (or above) an anchor rect; closes on Esc, outside click, or scrolling elsewhere. */
export function Popover({ anchor, className, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    const { width, height } = ref.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    const below = anchor.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 6) : below;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    // Presses on the anchor are left to its own click handler, which toggles the popover.
    const onDown = (e: MouseEvent) => {
      const onAnchor =
        e.clientX >= anchor.left && e.clientX <= anchor.right && e.clientY >= anchor.top && e.clientY <= anchor.bottom;
      if (!onAnchor) outside(e);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', outside, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', outside, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={pos ?? { visibility: 'hidden' }}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
    >
      {children}
    </div>,
    document.body,
  );
}
