# StudyAI — Product Vision and Identity

## 1. What StudyAI is

StudyAI is an intelligent, unified learning environment designed to bring the entirety of a student's studying workflow into one application.

At its current stage, StudyAI operates primarily as a Bring Your Own Key (BYOK) application. It acts as a client and orchestration layer for different LLM providers, tools, and specialized intelligence systems.

Eventually, StudyAI may also offer its own hosted AI services, but the underlying architecture should remain flexible and provider-independent.

However, StudyAI is not fundamentally an LLM wrapper or chatbot application.

Its purpose is to provide students with a complete environment in which they can organize their educational materials, understand difficult subjects, actively work through problems, practice concepts, and monitor their learning progress.

A student should be able to manage their entire learning workflow without constantly switching between disconnected applications.

---

## 2. The foundation: An interconnected learning environment

StudyAI brings together capabilities that students currently obtain from many different products:

- **Course and document management**
- **Intelligent tutoring** grounded in course materials
- **Document and lecture understanding**
- **Flashcard generation and spaced repetition**
- **Automatic quizzes and assessments**
- **Interactive mind maps and knowledge graphs**
- **Study guides and summaries**
- **Learning progress and mastery tracking**
- **Personalized learning recommendations**
- **Scientific and mathematical tools**
- **Research and educational content generation**

Products such as Google NotebookLM (Gemini Notebook), StudyFetch, and other educational AI platforms have already demonstrated the value of many of these capabilities. StudyAI should be competitive with these products in their respective areas.

However, simply reproducing their feature sets is not the objective.

---

## 3. The defining differentiator: The Scientific Canvas

The Scientific Canvas is what makes StudyAI fundamentally different.

It is not simply another drawing tool, whiteboard, or place to upload images. It is an intelligent, interactive workspace where students can visually construct, explore, manipulate, and reason about the subjects they are learning.

Students can:
- **Freely draw and write** using a natural digital pen-like experience.
- **Digitally work through questions** from lectures, textbooks, and assignments.
- **Construct mathematical equations, diagrams, graphs, and scientific representations.**
- **Create physics diagrams** involving forces, vectors, motion, and physical relationships.
- **Work with chemical structures, reactions, molecular representations, and biological diagrams.**
- **Ask the Tutor questions** about anything they have drawn or constructed.
- **Have the Tutor interpret their work**, identify mistakes, and explain underlying concepts.
- **Ask the Tutor to create, modify, annotate, or correct** elements on the canvas.
- **Ask the Tutor to generate interactive practice problems** based on their actual course materials.
- **Manipulate generated objects and representations themselves** rather than receiving static images.
- **Convert diagrams and mathematical constructions** into more interactive or simulated experiences where appropriate.

The Canvas supports both freehand drawing and structured, manipulable scientific objects.

Importantly, the system understands more than just the text contained in a drawing. It understands the relationships between objects, their positions, labels, values, mathematical meaning, and connections to other elements.

### Example in action:
1. A student uploads lecture notes about Newton's laws and opens the Scientific Canvas.
2. They draw a free-body diagram of an object resting on an inclined plane.
3. StudyAI interprets the object, the plane, gravity, the normal force, and friction. It understands the relationships between those elements and reasons about whether the diagram is physically correct.
4. The student can ask why a particular force points in a certain direction, request corrections, change the incline angle, or ask StudyAI to generate another problem using the same concepts.
5. The Tutor interacts with the actual canvas state, not merely receiving a screenshot and guessing what the student has drawn.

This same principle extends across mathematics, physics, chemistry, biology, and other scientific disciplines.

---

## 4. The connection between everything

The Scientific Canvas does not operate independently from the rest of StudyAI.

It is deeply connected to the Tutor, course materials, knowledge graph, document intelligence, mathematical and scientific tools, and personalized learning systems:

- A student working on a diagram can ask questions grounded in their lecture notes.
- A student struggling with a concept can have the Tutor generate a visual exercise directly on the Canvas.
- A student's mistakes and misconceptions inform their learning progress and future practice.
- The Tutor understands the context of what the student is currently working on without requiring them to repeatedly explain it.

The overall experience feels like one intelligent environment rather than several educational applications placed inside the same interface.

---

## 5. The long-term vision

StudyAI will become a student's central environment for learning and scientific exploration.

It combines the organizational and study-material capabilities demonstrated by existing educational AI products with a genuinely interactive scientific workspace.

The defining experience is the ability to move naturally between reading, asking questions, drawing, constructing, experimenting, receiving feedback, and practicing.

The application supports this process across different disciplines and educational levels.

The ultimate objective is not simply to help students obtain answers. It is to help them develop a deeper understanding of what they are learning through an environment that can understand both their educational materials and the work they create themselves.

---

## Related Documentation & Architecture References

- [Architecture Overview](ARCHITECTURE.md)
- [Canvas Interaction & Scene Graph](CANVAS_INTERACTION.md)
- [Document Intelligence & Grounding](DOCUMENT_INTELLIGENCE.md)
- [Adaptive Learning & Mastery](ADAPTIVE_LEARNING.md)
- [Engineering Reuse & Verification Invariants](../AGENTS.md)
