import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SlideDeckArtifact } from "../artifacts/api";
import { sourceLabel } from "./api";

type Props = {
  deck: SlideDeckArtifact;
  onOpenSource: (sourceRef: string) => void;
  onClose: () => void;
};

/** A real in-site presentation view: one slide at a time, with notes and live citations. */
export default function SlideDeckView({ deck, onOpenSource, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const slides = deck.content.slides;
  const total = slides.length;
  const slide = slides[index];

  useEffect(() => { container.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(value + 1, total - 1)); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(value - 1, 0)); }
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, onClose]);

  return (
    <div ref={container} tabIndex={-1} className="deck-viewer" role="dialog" aria-modal="true" aria-label="Presenting slide deck" data-testid="deck-viewer">
      <header className="deck-viewer-bar">
        <div><span className="deck-viewer-kicker">Presenting</span><strong>{deck.title}</strong></div>
        <div className="deck-viewer-tools">
          <span className="deck-viewer-count" data-testid="deck-viewer-count">{index + 1} of {total}</span>
          <button type="button" className="deck-viewer-icon" data-testid="deck-viewer-close" aria-label="Close presentation" onClick={onClose}><X size={18} strokeWidth={1.9} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="deck-viewer-stage">
        <article className="deck-viewer-slide" data-testid="deck-viewer-slide">
          <span className="deck-viewer-role">{slide.role}</span>
          <h2 data-testid="deck-viewer-title">{slide.title}</h2>
          {slide.visual && (
            <div className="deck-viewer-visual" aria-label={`Visual: ${slide.visual.altText}`}>
              <span>Visual described in your material</span>
              <p>{slide.visual.altText}</p>
            </div>
          )}
          {slide.claims.length > 0 && (
            <ul className="deck-viewer-claims">
              {slide.claims.map((claim, claimIndex) => (
                <li key={`${claim.sourceRef}-${claimIndex}`}>
                  <p>{claim.claim}</p>
                  <button type="button" className="slide-citation surface-provenance" data-testid="deck-viewer-citation" onClick={() => onOpenSource(claim.sourceRef)}>
                    Open source · {sourceLabel(claim.sourceRef)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {slide.notes && (
            <div className="deck-viewer-notes" data-testid="deck-viewer-notes"><strong>Speaker notes</strong><p>{slide.notes}</p></div>
          )}
        </article>
      </div>

      <footer className="deck-viewer-controls">
        <button type="button" data-testid="deck-viewer-prev" disabled={index === 0} onClick={() => setIndex((value) => Math.max(value - 1, 0))}>
          <ChevronLeft size={17} strokeWidth={1.9} aria-hidden="true" /> Previous
        </button>
        <div className="deck-viewer-dots" aria-hidden="true">
          {slides.map((_, dot) => <span key={dot} className={dot === index ? "active" : ""} />)}
        </div>
        <button type="button" data-testid="deck-viewer-next" disabled={index === total - 1} onClick={() => setIndex((value) => Math.min(value + 1, total - 1))}>
          Next <ChevronRight size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
