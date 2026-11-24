import { Quote } from "lucide-react";
import { sourceLabel, type StudyGuideContent } from "./api";

function Citation({ ref, onOpenSource }: { ref: string; onOpenSource: (ref: string) => void }) {
  return (
    <button type="button" className="studio-cite surface-provenance" data-testid="citation-chip" onClick={() => onOpenSource(ref)}>
      <Quote size={12} strokeWidth={1.9} aria-hidden="true" />
      <span>{sourceLabel(ref)}</span>
    </button>
  );
}

export default function StudyGuideView({ content, onOpenSource }: { content: StudyGuideContent; onOpenSource: (ref: string) => void }) {
  return (
    <article className="studio-guide" data-testid="study-guide" aria-labelledby="studio-guide-title">
      <header className="studio-doc-head">
        <h3 id="studio-guide-title" className="studio-doc-title">{content.title}</h3>
        {content.overview && <p className="studio-lead">{content.overview}</p>}
      </header>

      {content.sections.length > 0 && (
        <div className="studio-guide-sections">
          {content.sections.map((section, index) => (
            <section key={`${section.heading}-${index}`} className="studio-guide-section" aria-labelledby={`studio-guide-section-${index}`}>
              <h4 id={`studio-guide-section-${index}`}>{section.heading}</h4>
              <p>{section.body}</p>
              {section.sourceRefs.length > 0 && (
                <div className="studio-citations" aria-label={`Sources for ${section.heading}`}>
                  <span className="studio-cite-label">Source</span>
                  {section.sourceRefs.map((ref) => <Citation key={ref} ref={ref} onOpenSource={onOpenSource} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {content.keyTerms.length > 0 && (
        <section className="studio-guide-terms" aria-labelledby="studio-guide-terms-heading">
          <h4 id="studio-guide-terms-heading">Key terms</h4>
          <dl>
            {content.keyTerms.map((term, index) => (
              <div className="studio-term" key={`${term.term}-${index}`}>
                <dt>{term.term}</dt>
                <dd>{term.definition}</dd>
                <Citation ref={term.sourceRef} onOpenSource={onOpenSource} />
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}
