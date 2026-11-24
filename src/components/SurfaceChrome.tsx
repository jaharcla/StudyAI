import { ArrowLeft, X } from "lucide-react";
import "./surface-chrome.css";

export type SurfaceTone = "info" | "success" | "error" | "loading";

type HeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
  closeLabel: string;
  backClassName?: string;
  closeClassName?: string;
  className?: string;
};

/** One header grammar for every secondary surface. Legacy class names are
 *  appended so existing selectors and keyboard tests keep working. */
export function SurfaceHeader({ eyebrow, title, subtitle, backLabel, onBack, onClose, closeLabel, backClassName = "", closeClassName = "", className = "" }: HeaderProps) {
  return (
    <header className={`surface-header ${className}`.trim()}>
      <div className="surface-heading">
        <span className="surface-eyebrow" data-testid="surface-eyebrow">{eyebrow}</span>
        <h2 className="surface-title" data-testid="surface-title">{title}</h2>
        {subtitle && <p className="surface-subtitle">{subtitle}</p>}
      </div>
      <div className="surface-actions">
        {backLabel && onBack && (
          <button type="button" className={`surface-back ${backClassName}`.trim()} onClick={onBack} aria-label={backLabel}>
            <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
            {backLabel}
          </button>
        )}
        <button type="button" className={`surface-close ${closeClassName}`.trim()} onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X size={18} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

type NoticeProps = {
  tone: SurfaceTone;
  text: string;
  testId: string;
  className?: string;
};

/** One status vocabulary for every secondary surface. */
export function SurfaceNotice({ tone, text, testId, className = "" }: NoticeProps) {
  return (
    <div className={`surface-notice surface-notice-${tone} ${className}`.trim()} role="status" aria-live="polite" data-testid={testId}>
      <span className="surface-notice-dot" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
