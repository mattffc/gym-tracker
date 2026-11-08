# Programme file format

Last updated: 2026-11-08

The app imports a training block from a JSON file (Data → Import programme). This is the format Claude should write when asked for "the next 4 weeks".

```json
{
  "app": "gym-tracker",
  "type": "programme",
  "name": "Block 2: strength",
  "start": "2026-12-07",
  "weeks": [
    {
      "week": 1,
      "phase": "Intro",
      "days": [
        {
          "day": "Day 1",
          "ex": [
            { "name": "Squat", "sets": 4, "reps": 5, "pct": 80, "rpe": "7-8", "rest": "3-5 min", "tempo": "POWER" },
            { "name": "Bench Press", "sets": 4, "reps": 6, "pct": 75, "rpe": "6.5-7.5", "rest": "3-5 min", "tempo": "PAUSED" },
            { "name": "Pendlay row", "sets": 4, "reps": "8-10", "rpe": "8", "rest": "2 min" },
            { "name": "Chin-ups", "sets": 3, "reps": "MAX", "rpe": "9", "note": "bodyweight" }
          ]
        }
      ]
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | no | Shown at the top of the Train tab |
| `start` | no | Monday the block starts. Defaults to the Monday after the last block ends |
| `weeks[].phase` | no | e.g. Intro / Build / Attack / Recover |
| `days[].day` | no | Label, e.g. "Day 1" |
| `ex[].name` | **yes** | Use exactly **Squat**, **Bench Press**, **Deadlift** for the competition lifts (e1RM tracking keys on these). Variants start with the lift name: "Squat (paused)", "Bench Press (pin)" |
| `ex[].sets` | yes | Number of sets. Each gets its own row to log kg, reps and actual RPE |
| `ex[].reps` | yes | Number, or text like "8-10" or "MAX" |
| `ex[].pct` | no | % of 1RM. The app turns it into a kg range from Matt's recent e1RM |
| `ex[].rpe` | no | Target RPE, a number or range ("6.5-8.5"). Logged RPE is compared against its midpoint |
| `ex[].rest`, `tempo`, `note` | no | Shown as chips / hint text |

## The loop

1. Train the block, logging every set (kg, reps, actual RPE) and a daily check-in (sleep, stress, bodyweight).
2. At the end: Data → **Download report** (or Share). It contains the plan, every set with target vs actual RPE, check-ins, weekly tonnage / intensity / RPE drift / ACWR, the e1RM trend and adherence.
3. Give the report to Claude: "this is how the block went, give me the next 4 weeks". Claude replies with a programme file in this format.
4. Data → **Import programme**. It becomes the active block; old blocks and logs are kept.
