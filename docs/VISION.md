# Why StudyAI

> StudyAI is a tool built for students to communicate with their work. Instead of having your notebook, or your canvas app, your Gemini Notebook, and your general AI, what if it was all in one place. Our goal is to provide students with all the tools necessary to visualize and learn hard concepts. I built it because all the AI tools I used did not have interactive visual parts for studying that worked with how I learned, and I didn't want to pay a subscription to learn.

## What it is today

StudyAI is a study workspace that keeps your notes and documents on your own machine. The AI can run locally or through a cloud provider you choose — many of the models it uses are cloud-based. Based on the current [status](STATUS.md) and [README](../README.md), it includes:

- A course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- An AI Tutor through CopilotKit and LangGraphJS, with local or hosted providers, course-scoped document retrieval, and optional fact-check searches.
- Document import for PDF, DOCX, PPTX and UTF-8 TXT, with text chunks, search, and source references.
- A canvas with math and diagram recognition, a spatial scene graph, direct manipulation, and reviewable AI edit proposals.
- Learning activities with checked specifications.

See [architecture](ARCHITECTURE.md), [document intelligence](DOCUMENT_INTELLIGENCE.md) and [adaptive learning](ADAPTIVE_LEARNING.md) for the details.

## Why it exists

The tools I used for studying were text-first. Nothing let me work through a hard concept visually, the way I actually think through it, without stitching together three or four different apps. And the good ones all wanted a subscription. StudyAI is the thing I wished existed: one place where the notes, the canvas, the documents and the AI are working on the same problem with you.

## Where it's going

This is an invitation, not a roadmap. I built the core because I needed it, and I'd like other people to take it somewhere I couldn't — a better visual explanation, a smarter review flow, a provider that behaves well, a rough edge smoothed away. You don't need to know the whole codebase to start; there are small, well-described pieces waiting. If this sounds like something you'd like to help build, say hello — there's room to own a piece of it.
