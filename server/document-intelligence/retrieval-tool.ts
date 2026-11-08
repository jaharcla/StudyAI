import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type Database from "better-sqlite3";
import { retrieveCourseDocuments } from "./service.js";

export function createDocumentRetrievalTool(db: Database.Database, courseId: string) {
  const course = db.prepare("SELECT id FROM courses WHERE id=?").get(courseId) as { id: string } | undefined;
  if (!course) throw new Error("Cannot bind document retrieval to an unknown course.");
  return tool(
    async ({ query }) => JSON.stringify(retrieveCourseDocuments(db, course.id, query)),
    {
      name: "search_course_documents",
      description: "Search only the bound course's imported documents. Returns candidate excerpts and stable source references, or an explicit no_evidence result. Excerpts are not verified answers; do not infer support or invent citations.",
      schema: z.object({ query: z.string().trim().min(1).max(500).describe("A focused question or phrase to find in course documents.") }),
    },
  );
}
