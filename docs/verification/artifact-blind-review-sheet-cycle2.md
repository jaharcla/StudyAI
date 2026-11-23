# Artifact quality blind review sheet

Score each generation 0–5 on six dimensions. Model identity and provider are recorded separately, not shown here.
Keep disagreements instead of forcing consensus.

| Dimension | Weight | Score 0–5 |
|---|---:|---:|
| Intent fidelity | 20 | |
| Factual accuracy | 25 | |
| Course grounding | 20 | |
| Pedagogy | 20 | |
| Visual quality | 10 | |
| Interaction quality | 5 | |

## documented-request

**Request:** From the retrieved lecture note, make a study artifact that explains friction on an incline and includes one question. Keep it grounded in the note.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "friction-incline-study-artifact",
  "objective": "Explain friction on an incline and assess understanding using the retrieved note",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-friction-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "On an incline, friction opposes the motion of a block sliding down the surface. The normal force acts perpendicular to the surface and has magnitude mg cos(theta).",
      "concepts": [
        "friction",
        "incline",
        "normal force"
      ]
    },
    {
      "kind": "question",
      "id": "q-normal-force",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "According to the note, what is the magnitude of the normal force on a block on an incline?",
      "answer": "mg cos(theta)"
    }
  ],
  "relations": [
    {
      "from": "exp-friction-incline",
      "to": "q-normal-force",
      "relation": "explains"
    }
  ],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```

## ambiguous-request

**Request:** Make me something useful from this lesson on forces. Use your judgement about what to include.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "forces-incline-package",
  "objective": "Study forces on a block on an incline",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-forces-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "On an incline, a block experiences gravity vertically downward, a normal force perpendicular to the surface, and friction parallel to the surface opposing motion. The example uses a 45° incline and a 1 kg block, with force vectors shown as horizontal and vertical components.",
      "concepts": [
        "forces",
        "incline",
        "gravity",
        "normal force",
        "friction"
      ]
    },
    {
      "kind": "diagram",
      "id": "diag-forces-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "title": "Forces on a block on a 45° incline",
      "forces": [
        {
          "label": "Gravity",
          "components": [
            0,
            -9.8
          ]
        },
        {
          "label": "Normal force",
          "components": [
            -4.9,
            4.9
          ]
        },
        {
          "label": "Friction (example magnitude 3.0 N)",
          "components": [
            2.12,
            2.12
          ]
        }
      ]
    },
    {
      "kind": "worked-example",
      "id": "we-forces-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "For a 1 kg block on a 45° incline, resolve gravity, the normal force, and friction into horizontal and vertical components.",
      "steps": [
        "Gravity acts straight down, so its components are (0, -9.8) N.",
        "The normal force is perpendicular to the 45° surface and has magnitude 9.8 cos45° = 6.93 N, giving components (-4.9, 4.9) N.",
        "If the block slides down, friction points up the incline; with an example magnitude of 3.0 N, its components are (3.0 cos45°, 3.0 sin45°) = (2.12, 2.12) N."
      ],
      "answer": "Gravity = (0, -9.8) N; normal force = (-4.9, 4.9) N; friction = (2.12, 2.12) N."
    }
  ],
  "relations": [
    {
      "from": "exp-forces-incline",
      "to": "diag-forces-incline",
      "relation": "explains"
    },
    {
      "from": "exp-forces-incline",
      "to": "we-forces-incline",
      "relation": "explains"
    }
  ],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```

## multi-component-torque

**Request:** Build a package about torque with a diagram, an explanation, a question, a summary, and a short interactive exercise.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "torque-package-01",
  "objective": "Build a multi-component package about torque.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "torque-explanation",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "text": "Torque is the product of the lever arm and the applied force perpendicular to it. A beam in equilibrium has balanced clockwise and anticlockwise torques.",
      "concepts": [
        "torque",
        "lever arm",
        "equilibrium"
      ]
    },
    {
      "kind": "diagram",
      "id": "torque-diagram",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Balanced torques on a beam",
      "forces": [
        {
          "label": "Weight",
          "components": [
            0,
            -9.8
          ]
        },
        {
          "label": "Normal force",
          "components": [
            0,
            9.8
          ]
        },
        {
          "label": "Clockwise torque force",
          "components": [
            0,
            -6
          ]
        },
        {
          "label": "Anticlockwise torque force",
          "components": [
            0,
            6
          ]
        }
      ]
    },
    {
      "kind": "question",
      "id": "torque-question",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "A force of 15 N is applied perpendicular to a lever arm 2.0 m long. What torque is produced?",
      "answer": "30 N·m"
    },
    {
      "kind": "summary",
      "id": "torque-summary",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Torque summary",
      "sections": [
        {
          "heading": "Definition",
          "body": "Torque equals the lever arm multiplied by the applied force perpendicular to it."
        },
        {
          "heading": "Equilibrium",
          "body": "A beam in equilibrium has balanced clockwise and anticlockwise torques."
        }
      ]
    },
    {
      "kind": "interactive-exercise",
      "id": "torque-exercise",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "Read the torque from the torque-versus-lever-arm line at a lever arm of 2.0 m.",
      "exercise": {
        "mode": "graph-interpretation",
        "slope": 15,
        "intercept": 0,
        "xRange": [
          0,
          4
        ],
        "atX": 2
      }
    }
  ],
  "relations": [
    {
      "from": "torque-explanation",
      "to": "torque-question",
      "relation": "explains"
    },
    {
      "from": "torque-diagram",
      "to": "torque-explanation",
      "relation": "explains"
    },
    {
      "from": "torque-summary",
      "to": "torque-explanation",
      "relation": "explains"
    },
    {
      "from": "torque-exercise",
      "to": "torque-question",
      "relation": "explains"
    }
  ],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```

## insufficient-source

**Request:** What topics did my professor say would be on the final exam? Make a study artifact if you can.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "chem-120-lesson-03-insufficient-source",
  "objective": "Respond to a request for final exam topics when no course material is available",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "insufficient-source-explanation",
      "sourceRefs": [],
      "text": "The course material is not available: no announcement, syllabus, outline, or exam topic list was supplied. I cannot determine which topics your professor said would be on the final exam. Please upload the relevant announcement, syllabus, or course outline, or paste the professor's message, and I can build a study artifact from it.",
      "concepts": []
    }
  ],
  "relations": [],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```
