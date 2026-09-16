import { FiX } from "react-icons/fi";
import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics provide focus trapping, Escape, and focus restoration. */
export function Drawer({ open, onClose, label, side, children, className = "" }: {
  className?: string;
  open: boolean;
  onClose: () => void;
  label: string;
  side: "left" | "right";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} className={`pde-oas-drawer pde-oas-drawer-${side} ${className}`}
    aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="pde-oas-drawer-body">
      <div className="pde-oas-drawer-heading">
        <span>{label}</span>
        <button type="button" className="pde-oas-icon-button pde-oas-drawer-close" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><FiX size={18} aria-hidden="true" /></button>
      </div>
      {open ? children : null}
    </div>
  </dialog>;
}
