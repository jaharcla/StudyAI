# Independent pedagogy review — generation A

Score pedagogy only, 0-5.

Rubric: does the question require applying or transferring the idea to a new situation, rather than recalling or copying from the explanation? Consider whether the answer can be produced by restating the supplied text.

## Student request

From the retrieved lecture note, make a study artifact that explains friction on an incline and includes one question. Keep it grounded in the note.

## Generated package

```json
{
  "schemaVersion": 1,
  "id": "artifact-friction-incline-01",
  "objective": "Explain friction direction and normal force for a block sliding down an incline, then apply both to a new ramp angle.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-friction-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "For a block sliding down an incline, friction opposes the sliding motion and therefore acts up along the incline. The normal force acts perpendicular to the surface and has magnitude mg cos(theta).",
      "concepts": [
        "friction",
        "incline",
        "normal force"
      ]
    },
    {
      "kind": "question",
      "id": "q-friction-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "A crate slides down a ramp toward the lower end. If the ramp angle is alpha instead of theta, what direction does friction act relative to the ramp, and what is the normal-force magnitude?",
      "answer": "Friction acts up the incline, opposite the crate's sliding motion. The normal-force magnitude is mg cos(alpha)."
    }
  ],
  "relations": [
    {
      "from": "exp-friction-incline",
      "to": "q-friction-incline",
      "relation": "explains"
    }
  ],
  "provenance": {
    "generatedAt": "2026-06-24T00:00:00Z"
  },
  "acceptance": {
    "decision": "pending"
  }
}
```

Pedagogy score: ___ / 5
