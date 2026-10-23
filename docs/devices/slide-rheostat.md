# Slide rheostat (variable resistor)

From [references/machine-lab/slide-rheostat.png](../../references/machine-lab/slide-rheostat.png).
**Confirmed** means read from the photo. **?** means a value is still needed.

## What the photo shows (confirmed)

- A long, low housing of perforated galvanized steel (round holes on the sides and the curved top)
  on a flat base with slotted feet at each end, for screwing it to the bench.
- A **white plastic slider** rides on a square rail along the top edge. It is shown at the far
  left end.
- Black leads enter at the **left end**, at base level. The terminals are on the end plates and
  are not visible in the photo.
- Lettering on the cover reads "UNIS" upside down. It may be a brand or a handwritten mark, and
  it is not confirmed.
- No rating plate is visible.

## How it works (standard construction)

A resistance wire is wound on a long ceramic tube inside the cover. Both ends of the wire go to
end terminals. The slider's contact touches the winding where it sits and connects through the
rail to a third terminal.

```text
   A ──/\/\/\/\/\/\/\/\/\/\── B        R_AB = R (fixed, whole winding)
              ↑
              C (slider)              R_AC = x·R,   R_CB = (1 − x)·R,   x = slider position 0…1
```

**Inputs:** three terminals, **A** (end 1), **B** (end 2) and **C** (slider), plus one control,
the slider position.

Two ways to wire it, both of which students must be able to do and get wrong:

| Wiring                            | Uses                                    | Sheets                                                                                                          |
| --------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Variable resistor (rheostat)      | A–C or C–B                              | Field "variable resistance" in series with F1–F2 (sheets 2–5); variable load (sheet 5)                          |
| Potential divider (potentiometer) | A, B across the supply, C as the output | Not in the sheets, but a common lab way to bring If down to 0                                                   |
| A–B by mistake                    | Ends only                               | The slider does nothing. This is a classic mistake, and the bench must show no change in If as the slider moves |

## App model

- **Tapped winding:** the winding A–B is always R. The slider C touches it at a fraction x from A
  through a 0.5 Ω contact, so an ohmmeter reads A–C = x·R + 0.5 Ω and C–B = (1 − x)·R + 0.5 Ω.
  The winding's tap point is not a socket, so the three resistances are stored as the equivalent
  delta between A, B and C. It is electrically identical from the sockets.
- **Controls:**
  - Drag the slider along the rail; hold **Shift** while dragging to move ten times slower.
  - The **mouse wheel** moves it 0.1 % (1 % with Shift).
  - **Arrow keys** move it 0.5 %, 5 % with Shift, and 0.05 % with Alt.
- **Readout:** hovering or dragging shows the position and the A–C resistance, for example
  "6.0 % · A–C 121.5 Ω".
- **Reach:** with these steps every field current on the sheets (0.1–0.6 A from 220 V through the
  250 Ω field) can be set to the ammeter's 0.01 A, and every load current (1–3 A) to about
  0.03 A. Both are covered by `tests/rheostat.test.ts`.
- **Overload:** the current in each end of the winding is checked against the rating. Above it,
  the cover glows and the overload is printed.

## How many the generator sheets need

- One as the **field rheostat**: in series with F1–F2 and the 1 A ammeter (sheets 2–5). It has to
  cover If ≈ 0.1–0.6 A from 220 V DC, which needs a high-ohm, low-current unit.
- One or more as the **load** (sheet 5, IL up to 3 A on a 6–12 A ammeter), which needs a low-ohm,
  high-current unit. **?** Is the load also a slide rheostat like this, or a lamp/resistor bank?

## Needed from the lab

1. The **rating plate** (usually on an end plate): ohms and amps. The lab may have several sizes,
   in which case each needs a plate.
2. A photo of the **end plate(s)** showing the terminals and their labels.
3. Which rheostat is used as the field rheostat and which as the load in sheets 2–5.
