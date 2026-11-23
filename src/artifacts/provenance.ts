import type { ClaimReview } from "./contracts";
import type { ArtifactPackage } from "./package";

export type RetrievedChunk = { ref: string; text: string };

/**
 * Pure evidence review. Only a `direct` claim whose excerpt is literally contained in the
 * retrieved chunk may be presented as course fact; every other relationship is labelled and
 * held for review. No network calls, no model calls, no board access.
 */
export function reviewProvenance(pkg: ArtifactPackage, retrievedChunks: readonly RetrievedChunk[]): ClaimReview[] {
  const chunks = new Map(retrievedChunks.map((chunk) => [chunk.ref, chunk.text]));
  const reviews: ClaimReview[] = [];
  for (const component of pkg.components) {
    for (const claim of component.claims ?? []) {
      const chunkText = chunks.get(claim.sourceRef);
      if (claim.relationship === "direct") {
        if (chunkText !== undefined && chunkText.includes(claim.excerpt)) {
          reviews.push({ componentId: component.id, claim: claim.claim, outcome: "verified", relationship: claim.relationship, reason: "Excerpt is contained in the retrieved chunk." });
        } else {
          reviews.push({ componentId: component.id, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: "Direct claim failed excerpt containment against the retrieved chunk." });
        }
      } else if (claim.relationship === "unresolved-conflict") {
        reviews.push({ componentId: component.id, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: "Unresolved conflict cannot be presented as course fact." });
      } else {
        reviews.push({ componentId: component.id, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: `${claim.relationship} is an authored interpretation, not a retrieved course fact.` });
      }
    }
  }
  return reviews;
}
