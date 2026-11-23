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
  "id": "artifact-friction-incline-01",
  "objective": "Explain the direction of friction for a block sliding down an incline and state the normal force magnitude.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "friction-incline-explanation",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "For a block sliding down an incline, friction opposes the sliding motion, so it acts up along the surface. The normal force acts perpendicular to the incline and has magnitude mg cos(theta).",
      "concepts": [
        "friction on an incline",
        "opposing motion",
        "normal force"
      ]
    },
    {
      "kind": "question",
      "id": "friction-incline-question",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "For a block sliding down an incline, what direction does friction act and what is the normal force magnitude?",
      "answer": "Friction acts opposite the sliding motion, up along the incline; the normal force is perpendicular to the surface with magnitude mg cos(theta)."
    }
  ],
  "relations": [
    {
      "from": "friction-incline-explanation",
      "to": "friction-incline-question",
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
  "id": "lesson-03-forces-incline",
  "objective": "Identify and resolve gravity, normal force, and friction directions for a block on an incline.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "diagram",
      "id": "diagram-incline-forces",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "title": "Force vectors for a 1 kg block at rest on a 30° incline",
      "forces": [
        {
          "label": "gravity",
          "components": [
            0,
            -9.8
          ]
        },
        {
          "label": "normal",
          "components": [
            -4.24,
            7.35
          ]
        },
        {
          "label": "friction",
          "components": [
            4.24,
            2.45
          ]
        }
      ]
    },
    {
      "kind": "worked-example",
      "id": "worked-example-incline-force-directions",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "For a 1 kg block at rest on a 30° incline that rises to the right, identify the directions and vector components of gravity, the normal force, and friction.",
      "steps": [
        "Use x to the right and y upward; the incline rises to the right at 30°.",
        "Gravity acts vertically downward, so for a 1 kg block its force is (0, -9.8) N.",
        "The normal force is perpendicular to the incline and points away from the surface. Its magnitude is mg cos(30°) = 8.49 N, giving components (-4.24, 7.35) N.",
        "The block tends to slide down the incline toward the lower left, so static friction acts up the incline toward the upper right. Its magnitude is mg sin(30°) = 4.90 N, giving components (4.24, 2.45) N."
      ],
      "answer": "Gravity: (0, -9.8) N downward; normal: (-4.24, 7.35) N perpendicular to the incline; friction: (4.24, 2.45) N up the incline."
    }
  ],
  "relations": [
    {
      "from": "diagram-incline-forces",
      "to": "worked-example-incline-force-directions",
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
  "id": "torque-package-chem-120-lesson-03",
  "objective": "Use lever arm and perpendicular force to calculate torque and identify balanced clockwise and anticlockwise torques in equilibrium.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-torque-01",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "text": "Torque is the turning effect found by multiplying the lever arm by the applied force perpendicular to it. For a beam in equilibrium, the clockwise torque equals the anticlockwise torque, so there is no net turning effect.",
      "concepts": [
        "torque",
        "lever arm",
        "perpendicular force",
        "rotational equilibrium"
      ]
    },
    {
      "kind": "diagram",
      "id": "diag-torque-01",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Balanced torques on a horizontal beam",
      "forces": [
        {
          "label": "gravity",
          "components": [
            0,
            -9.8
          ]
        },
        {
          "label": "right applied force",
          "components": [
            0,
            -19.6
          ]
        },
        {
          "label": "pivot reaction",
          "components": [
            0,
            29.4
          ]
        }
      ]
    },
    {
      "kind": "question",
      "id": "q-torque-01",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "A 12 N force acts perpendicular to a lever arm 0.50 m from a pivot. What torque does it produce?",
      "answer": "6.0 N·m of torque."
    },
    {
      "kind": "summary",
      "id": "sum-torque-01",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Torque and equilibrium",
      "sections": [
        {
          "heading": "Definition",
          "body": "Torque equals the lever arm multiplied by the force applied perpendicular to it."
        },
        {
          "heading": "Equilibrium",
          "body": "A beam in equilibrium has balanced clockwise and anticlockwise torques."
        },
        {
          "heading": "Key idea",
          "body": "Only the perpendicular part of the force contributes to torque about the pivot."
        }
      ]
    },
    {
      "kind": "interactive-exercise",
      "id": "ie-torque-01",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "On a torque-vs-lever-arm line y = 2x, what torque value is read from the line at x = 1?",
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
      "from": "exp-torque-01",
      "to": "diag-torque-01",
      "relation": "explains"
    },
    {
      "from": "exp-torque-01",
      "to": "q-torque-01",
      "relation": "explains"
    },
    {
      "from": "exp-torque-01",
      "to": "sum-torque-01",
      "relation": "explains"
    },
    {
      "from": "exp-torque-01",
      "to": "ie-torque-01",
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
  "id": "chem-120-lesson-03-insufficient-source-final-exam-topics",
  "objective": "Create a study artifact only if the professor's stated final exam topics can be verified from course materials.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "insufficient-source-explanation",
      "sourceRefs": [],
      "text": "The course material is not available, so I cannot identify the professor's stated final exam topics. What is missing is the professor's announcement, syllabus or course outline, review sheet, or lecture/recorded statement listing the final exam coverage. Please upload that announcement or outline, and I can turn it into a study checklist or other study artifact.",
      "concepts": [
        "final exam coverage",
        "missing source material",
        "study planning"
      ]
    }
  ],
  "relations": [],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```
