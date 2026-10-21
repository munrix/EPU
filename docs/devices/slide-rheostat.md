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

- Equipment with **three terminals** and two resistor components, A–C = x·R and C–B = (1 − x)·R,
  with a small floor (about 0.5 Ω contact resistance) so x = 0 is not a perfect short.
- The slider is **dragged along the top rail** on the bench, like the real one. The position also
  appears as a percentage while dragging. The resistance in ohms is not shown, because the real
  device has no scale.
- **Current rating:** the winding has a maximum current (**?** from the rating plate). Above it,
  the device warns (cover glows), and with a sustained overload the winding burns open, as a fuse
  does in the existing protection model. Undo restores it.
- **Power:** at the slider end of the winding, only the used part heats. The rating applies to
  current, not to the whole-winding power.
- The terminals use the same 4 mm sockets and stacking as the rest of the bench (**?** confirm
  they are banana sockets and not screw posts).

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
