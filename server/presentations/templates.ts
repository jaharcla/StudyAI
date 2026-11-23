import { z } from "zod";

export const deckTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  licence: z.enum(["CC0", "CC BY", "Apache-2.0"]),
  attribution: z.string().min(1).max(300),
  language: z.literal("en"),
  builtin: z.boolean(),
  presentonTemplate: z.string().min(1).max(80),
}).strict();

export type DeckTemplate = z.infer<typeof deckTemplateSchema>;

/**
 * Small English-only template manifest. These are Presenton built-in designs;
 * attribution records the source of the design, not a claim of authorship.
 */
export const deckTemplates: readonly DeckTemplate[] = deckTemplateSchema.array().min(1).max(12).parse([
  {
    id: "general-en",
    name: "General (education)",
    licence: "Apache-2.0",
    attribution: "Presenton built-in General template (Apache-2.0 project)",
    language: "en",
    builtin: true,
    presentonTemplate: "general",
  },
  {
    id: "training-en",
    name: "Training / coursework",
    licence: "Apache-2.0",
    attribution: "Presenton built-in General template (Apache-2.0 project)",
    language: "en",
    builtin: true,
    presentonTemplate: "general",
  },
]);

export function findDeckTemplate(id: string): DeckTemplate {
  const found = deckTemplates.find((template) => template.id === id);
  if (!found) throw new Error(`Unknown slide deck template: ${id}`);
  return found;
}
