import { Quote } from "lucide-react";
import { sourceLabel, type StudyGuideContent } from "./api";

export default function StudyGuideView({ content, onOpenSource }: { content: StudyGuideContent; onOpenSource: (ref: string) => void }) {
  return (
    <article className="studio-guide" data-testid="study-guide">
      <h3>{content.title}</h3>
      {content.overview && <p className="studio-guide-overview">{content.overview}</p>}
      <div className="studio-guide-sections">
        {content.sections.map((section, index) => (
          <section key={`${section.heading}-${index}`} className="studio-guide-section">
            <h4>{section.heading}</h4>
            <p>{section.body}</p>
            <div className="studio-citations">
              {section.sourceRefs.map((ref) => (
                <button key={ref} type="button" onClick={() => onOpenSource(ref)}>
                  <Quote size={11} /> {sourceLabel(ref)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {content.keyTerms.length > 0 && (
        <section className="studio-guide-terms">
          <h4>Key terms</h4>
          <dl>
            {content.keyTerms.map((term, index) => (
              <div key={`${term.term}-${index}`}>
                <dt>{term.term}</dt>
                <dd>{term.definition}</dd>
                <button type="button" onClick={() => onOpenSource(term.sourceRef)}><Quote size={11} /> {sourceLabel(term.sourceRef)}</button>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}
