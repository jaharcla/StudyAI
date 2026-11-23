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

The insufficient-source case uses the separate refusal rubric registered in docs/decisions/ADR-2026-11-23-artifact-quality-refusal-rubric.md.

## documented-request

**Request:** From the retrieved lecture note, make a study artifact that explains friction on an incline and includes one question. Keep it grounded in the note.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "chem120-lesson03-friction-incline",
  "objective": "Explain friction on an incline and apply the normal-force relation to compute a friction force.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-friction-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "Friction opposes the motion of a block sliding down an incline. The normal force acts perpendicular to the surface and has magnitude mg cos(theta).",
      "concepts": [
        "friction",
        "normal force",
        "incline"
      ]
    },
    {
      "kind": "question",
      "id": "q-friction-incline",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "Compute the kinetic friction force magnitude on the 20° incline before the angle is increased.",
      "answer": "Approximately 16.6 N, from 0.30 × 6.0 kg × 9.8 m/s² × cos(20°).",
      "scenario": "A 6.0 kg block slides down a 20° incline where g = 9.8 m/s² and the kinetic friction coefficient is 0.30. The incline angle is then increased to 30° while mass and coefficient stay the same.",
      "bloomLevel": "application"
    }
  ],
  "relations": [],
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
  "objective": "Apply force directions and net-force reasoning on an inclined plane",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-forces",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "text": "On an incline, gravity acts vertically downward, the normal force acts perpendicular to the surface, and friction acts parallel to the surface in the direction that opposes sliding.",
      "concepts": [
        "gravity",
        "normal force",
        "friction",
        "incline"
      ]
    },
    {
      "kind": "diagram",
      "id": "diag-forces",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "title": "Forces on a block on a 30° incline",
      "forces": [
        {
          "label": "gravity",
          "components": [
            0,
            -9.8
          ]
        },
        {
          "label": "normal force",
          "components": [
            -4.24,
            7.35
          ]
        },
        {
          "label": "friction",
          "components": [
            1.47,
            0.85
          ]
        }
      ]
    },
    {
      "kind": "question",
      "id": "q-net-force",
      "sourceRefs": [
        "studyai://document/module-1/text/4?chunk=0"
      ],
      "prompt": "Calculate the net force on the block along the incline after the angle is increased, using g = 9.8 m/s².",
      "answer": "About 19.2 N down the incline: (4.0 kg)(9.8 m/s²) sin 40° − 0.20(4.0 kg)(9.8 m/s²) cos 40°.",
      "scenario": "A 4.0 kg block rests on a 30° incline. The coefficient of kinetic friction is 0.20. Then the incline angle is increased to 40° while the coefficient stays 0.20.",
      "bloomLevel": "application"
    }
  ],
  "relations": [
    {
      "from": "exp-forces",
      "to": "q-net-force",
      "relation": "explains"
    }
  ],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```

## held-out-ph (held out)

**Request:** Build a short artifact explaining pH with one application question that requires a calculation.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "pH-short-artifact",
  "objective": "Explain pH and apply it to calculate a changed solution's pH.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-pH",
      "sourceRefs": [
        "studyai://document/module-4/text/18?chunk=0"
      ],
      "text": "pH is defined as the negative base-ten logarithm of the hydrogen ion concentration: pH = -log10[H+]. For example, a solution with [H+] = 1e-3 has pH 3.",
      "concepts": [
        "pH",
        "hydrogen ion concentration"
      ]
    },
    {
      "kind": "question",
      "id": "q-pH-dilution",
      "sourceRefs": [
        "studyai://document/module-4/text/18?chunk=0"
      ],
      "prompt": "Compute the pH of the solution after the base is added.",
      "answer": "pH = -log10(1.0×10^-5) = 5.0.",
      "scenario": "A solution initially has [H+] = 1.0×10^-2 M. After adding base, the hydrogen ion concentration decreases to 1.0×10^-5 M.",
      "bloomLevel": "application"
    }
  ],
  "relations": [],
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
  "objective": "Build a package about torque with a diagram, an explanation, a question, a summary, and a short interactive exercise.",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-torque",
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
      "id": "diag-torque",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Beam in equilibrium about a central pivot",
      "forces": [
        {
          "label": "weight 30 N",
          "components": [
            0,
            -30
          ],
          "position": {
            "x": -1.5,
            "y": 0
          }
        },
        {
          "label": "load 45 N",
          "components": [
            0,
            -45
          ],
          "position": {
            "x": 1,
            "y": 0
          }
        },
        {
          "label": "normal 75 N",
          "components": [
            0,
            75
          ],
          "position": {
            "x": 0,
            "y": 0
          }
        }
      ]
    },
    {
      "kind": "question",
      "id": "q-torque",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "Calculate the net torque about the pin after the move, including its direction.",
      "answer": "45 N·m clockwise (the 90 N·m clockwise torque from the right load exceeds the 45 N·m counterclockwise torque from the left load).",
      "scenario": "A 4.0 m beam is pinned at its center. A 30 N weight hangs 1.5 m left of the pin, and a 45 N load hangs 1.0 m right of the pin. If the right load is moved to 2.0 m right of the pin while the left load stays fixed, determine the net torque about the pin.",
      "bloomLevel": "application"
    },
    {
      "kind": "summary",
      "id": "sum-torque",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "title": "Torque and equilibrium",
      "sections": [
        {
          "heading": "Definition",
          "body": "Torque equals the lever arm multiplied by the force perpendicular to it."
        },
        {
          "heading": "Equilibrium",
          "body": "A beam is in equilibrium when clockwise and anticlockwise torques balance."
        }
      ]
    },
    {
      "kind": "interactive-exercise",
      "id": "ix-torque",
      "sourceRefs": [
        "studyai://document/module-2/text/9?chunk=1"
      ],
      "prompt": "Read the graph to find the torque for the 45 N load at a 2.0 m lever arm.",
      "exercise": {
        "mode": "graph-interpretation",
        "slope": 45,
        "intercept": 0,
        "xRange": [
          0,
          2
        ],
        "atX": 2
      }
    }
  ],
  "relations": [
    {
      "from": "exp-torque",
      "to": "diag-torque",
      "relation": "explains"
    },
    {
      "from": "exp-torque",
      "to": "q-torque",
      "relation": "explains"
    },
    {
      "from": "exp-torque",
      "to": "sum-torque",
      "relation": "explains"
    }
  ],
  "provenance": {},
  "acceptance": {
    "decision": "pending"
  }
}
```

## held-out-graph-reading (held out)

**Request:** From the note, explain what the slope of a distance-time graph tells you, then add one question that asks the student to read a value from a new graph.

**Generated package:**

```json
{
  "schemaVersion": 1,
  "id": "held-out-graph-reading",
  "objective": "Explain what the slope of a distance-time graph indicates and apply it to a new graph",
  "courseId": "chem-120",
  "lessonId": "lesson-03",
  "components": [
    {
      "kind": "explanation",
      "id": "exp-slope",
      "sourceRefs": [
        "studyai://document/module-3/text/12?chunk=2"
      ],
      "text": "On a distance-time graph, the slope of the line gives the speed, and a steeper line means a greater speed.",
      "concepts": [
        "distance-time graph",
        "slope",
        "speed"
      ]
    },
    {
      "kind": "graph",
      "id": "graph-new",
      "sourceRefs": [
        "studyai://document/module-3/text/12?chunk=2"
      ],
      "expression": "5*x",
      "xRange": [
        0,
        8
      ],
      "xLabel": "x",
      "yLabel": "y"
    },
    {
      "kind": "question",
      "id": "q-read",
      "sourceRefs": [
        "studyai://document/module-3/text/12?chunk=2"
      ],
      "prompt": "Compute the speed represented by the new line.",
      "answer": "(30 m - 10 m)/(6 s - 2 s) = 5 m/s",
      "scenario": "A new distance-time graph shows a straight line through (2 s, 10 m) and (6 s, 30 m), while an earlier trip's line was steeper.",
      "bloomLevel": "application"
    }
  ],
  "relations": [
    {
      "from": "exp-slope",
      "to": "q-read",
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

**Outcome:**

```json
{
  "status": "insufficient-source",
  "missing": [
    "No course material, syllabus, lecture notes, or professor communication was supplied; there is no record of which topics the professor said would be on the final exam."
  ],
  "nextStep": "Provide the syllabus, lecture slides, exam review sheet, or any professor announcement listing final exam topics, then resubmit the request."
}
```
