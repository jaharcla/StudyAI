import type { ClaimProvenance, ClaimReview } from "./contracts";
import type { ArtifactPackage } from "./package";

export type RetrievedChunk = { ref: string; text: string };

type ReplayStateClaims = { id: string; claims?: readonly ClaimProvenance[] };

/**
 * Pure evidence review. Only a `direct` claim whose excerpt is literally contained in the
 * retrieved chunk may be presented as course fact; every other relationship is labelled and
 * held for review. No network calls, no model calls, no board access.
 */
function reviewClaim(claim: ClaimProvenance, owner: string, chunks: Map<string, string>): ClaimReview {
  if (claim.relationship === "direct") {
    const chunkText = chunks.get(claim.sourceRef);
    if (chunkText !== undefined && chunkText.includes(claim.excerpt)) {
      return { componentId: owner, claim: claim.claim, outcome: "verified", relationship: claim.relationship, reason: "Excerpt is contained in the retrieved chunk." };
    }
    return { componentId: owner, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: "Direct claim failed excerpt containment against the retrieved chunk." };
  }
  if (claim.relationship === "unresolved-conflict") {
    return { componentId: owner, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: "Unresolved conflict cannot be presented as course fact." };
  }
  return { componentId: owner, claim: claim.claim, outcome: "needs-review", relationship: claim.relationship, reason: `${claim.relationship} is an authored interpretation, not a retrieved course fact.` };
}

const chunkMap = (chunks: readonly RetrievedChunk[]) => new Map(chunks.map((chunk) => [chunk.ref, chunk.text]));

/** Reviews component claims and step claims on worked examples through the same gates. */
export function reviewProvenance(pkg: ArtifactPackage, retrievedChunks: readonly RetrievedChunk[]): ClaimReview[] {
  const chunks = chunkMap(retrievedChunks);
  const reviews: ClaimReview[] = [];
  for (const component of pkg.components) {
    for (const claim of component.claims ?? []) reviews.push(reviewClaim(claim, component.id, chunks));
    if (component.kind === "worked-example") {
      for (const state of component.states ?? []) {
        for (const claim of state.claims ?? []) reviews.push(reviewClaim(claim, `${component.id}/${state.id}`, chunks));
      }
    }
  }
  return reviews;
}

/** Same gates for the compiler-produced replay states shown on the board. */
export function reviewCompiledStates(states: readonly ReplayStateClaims[], retrievedChunks: readonly RetrievedChunk[]): ClaimReview[] {
  const chunks = chunkMap(retrievedChunks);
  return states.flatMap((state) => (state.claims ?? []).map((claim) => reviewClaim(claim, state.id, chunks)));
}
