import { type ReactNode, useEffect } from "react";
import { Icon } from "./icon.tsx";

/** A dialog over the page: centred on a desktop, a bottom sheet on a phone; Escape closes it. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
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
      <section className="panel sheet" role="dialog" aria-label={title}>
        <header style={{ display: "flex", alignItems: "center" }}>
          <span className="k" style={{ flex: 1 }}>
            {title}
          </span>
          <button type="button" className="btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
