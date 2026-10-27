import { type ReactNode, useEffect } from "react";
import { Icon } from "./icon.tsx";

/**
 * A dialog over the page: centred on a desktop, a bottom sheet on a phone; Escape closes it.
 * `heading` replaces the small title line with the caller's own; `actions` sit beside Close.
 */
export function Sheet({
  title,
  onClose,
  children,
  heading,
  actions,
  wide = false,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  heading?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <section className={`panel sheet${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
        <header className="sheet-head">
          {heading ?? <span className="k sheet-title">{title}</span>}
          {actions}
          <button type="button" className="btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
