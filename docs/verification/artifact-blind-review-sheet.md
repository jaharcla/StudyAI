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
  "id": "artifact-001",
  "objective": "Explain friction on an incline and include a question",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "explanation-001",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "Friction opposes the motion of a block sliding down an incline. The normal force acts perpendicular to the surface and has magnitude mg cos(theta).",
      "concepts": [
        "friction",
        "incline",
        "normal force"
      ]
    },
    {
      "kind": "question",
      "id": "question-001",
      "sourceRefs": [],
      "prompt": "If a block is sliding down an incline, how does the normal force relate to the angle of the incline?",
      "answer": "The normal force is equal to mg cos(theta), where theta is the angle of the incline."
    }
  ],
  "relations": [
    {
      "from": "explanation-001",
      "to": "question-001",
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
  "id": "artifact-001",
  "objective": "Understand forces on an incline",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "explanation-001",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "Forces on a block on an incline include gravity, the normal force, and friction. These forces act in specific directions and can be analyzed using vector components.",
      "concepts": [
        "gravity",
        "normal force",
        "friction",
        "incline",
        "vector components"
      ]
    },
    {
      "kind": "diagram",
      "id": "diagram-001",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "title": "Forces on an incline",
      "forces": [
        {
          "label": "gravity",
          "components": [
            0,
            0
          ]
        },
        {
          "label": "normal force",
          "components": [
            0,
            0
          ]
        },
        {
          "label": "friction",
          "components": [
            0,
            0
          ]
        }
      ]
    }
  ],
  "relations": [
    {
      "from": "explanation-001",
      "to": "diagram-001",
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
  "id": "torque-package-001",
  "objective": "Understand torque, its calculation, and its application in equilibrium.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "explanation-001",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "text": "Torque is the product of the lever arm and the applied force perpendicular to it. A beam in equilibrium has balanced clockwise and anticlockwise torques.",
      "concepts": [
        "torque",
        "lever arm",
        "force",
        "equilibrium"
      ]
    },
    {
      "kind": "diagram",
      "id": "diagram-001",
      "sourceRefs": [],
      "title": "Torque Diagram",
      "forces": [
        {
          "label": "Force 1",
          "components": [
            0,
            1
          ]
        },
        {
          "label": "Force 2",
          "components": [
            2,
            3
          ]
        }
      ]
    },
    {
      "kind": "question",
      "id": "question-001",
      "sourceRefs": [],
      "prompt": "What is the torque produced by a 10 N force applied at a 2 m lever arm with a 90-degree angle?",
      "answer": "20 N·m"
    },
    {
      "kind": "summary",
      "id": "summary-001",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Summary of Torque",
      "sections": [
        {
          "heading": "Definition",
          "body": "Torque is the product of the lever arm and the applied force perpendicular to it."
        },
        {
          "heading": "Equilibrium",
          "body": "A beam in equilibrium has balanced clockwise and anticlockwise torques."
        }
      ]
    },
    {
      "kind": "interactive-exercise",
      "id": "interactive-exercise-001",
      "sourceRefs": [],
      "prompt": "Calculate the torque for a force of 5 N applied at a lever arm of 3 m with a 90-degree angle.",
      "exercise": {
        "mode": "graph-interpretation",
        "slope": 2,
        "intercept": 0,
        "xRange": [
          -1,
          1
        ],
        "atX": 1
      }
    }
  ],
  "relations": [
    {
      "from": "explanation-001",
      "to": "diagram-001",
      "relation": "explains"
    },
    {
      "from": "explanation-001",
      "to": "summary-001",
      "relation": "summarizes"
    },
    {
      "from": "question-001",
      "to": "explanation-001",
      "relation": "tests"
    },
    {
      "from": "interactive-exercise-001",
      "to": "explanation-001",
      "relation": "demonstrates"
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

**Acknowledgement:** What topics did my professor say would be on the final exam?
