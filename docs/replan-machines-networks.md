# Re-plan: DC machines and networks labs (draft 2, 21 Oct 2026)

Source sheets: Erbil Polytechnic University, Erbil Technology College (Dept. of AITE), DC
Electrical Machine Lab, 3rd semester, experiments 1–5 (2023–2026 editions).

Items marked **?** need a photo or confirmation before they are modeled (same rule as
[lab-inventory.md](lab-inventory.md)).

## Status (21 Oct 2026)

Built and pushed: the generator bench and **DCM 02** (open-circuit and magnetization curves, parts A
and B).

- Devices, with sockets placed from the photos:
  - the M-G set ([dc-machine-set.md](devices/dc-machine-set.md))
  - field and load slide rheostats ([slide-rheostat.md](devices/slide-rheostat.md))
  - the supply console ([control-supply-console.md](devices/control-supply-console.md))
  - the load switch ([load-switch.md](devices/load-switch.md))
- Generator physics (`src/machines/dcGenerator.ts`, `src/electrical/solvers/machine-dc.ts`):
  - the open-circuit curve, with residual magnetism and hysteresis
  - E ∝ N
  - self-excitation, with critical resistance and critical speed
  - a reversed field that fails to build up
  - load drop through Ra = 4 Ω plus armature reaction
  - prime-mover droop
  - all covered by `tests/generator.test.ts`.
- Stand-ins until photos arrive:
  - a prime-mover START/STOP and speed control on the set
  - three DT-9205A meters for the sheets' 1 A, 0–300 V and 6–12 A meters

Next: DCM 03–05 on the same bench, the DCM 01 rebuild on the M-G set, and wiring quality. Leads
are drawn over device controls and can block them (the console START button), and that is the
first fix.

## Priority: wiring first

The most important thing is that students **connect the leads correctly and see them
correctly**. Physics and polish come after. Concretely:

1. **Every terminal where it really is.** Sockets, labels (A1 A2 F1 F2 D1 D2, +/−, meter
   posts) and colors copied from the device photos.
2. **Leads that read like the real bench.** A choice of lead colors, sag, readable stacking,
   draggable bend points (the `waypoints` field already exists in the data but has no UI),
   highlight on hover of everything on the same net, and no lead hidden behind a device.
3. **The sheet's figure beside the bench.** The sheet's schematic is redrawn as a live diagram.
   Each branch lights up when the bench wiring forms it, so the student can see which part of
   the figure is still missing.
4. **Wiring check with plain explanations.** "Check wiring" compares the bench nets with the
   figure as a topology (not by position) and names each mistake, for example:
   - ammeter in parallel → "the 1 A ammeter is across the field; it would short it"
   - voltmeter in series → "the voltmeter is in series with the load; no current can flow"
   - reversed analog meter → "the needle would deflect backwards; swap + and −"
   - field reversed on a self-excited machine → it is not an error, but the voltage won't build
     up (physics shows it)
   - missing switch, or the switch closed before the speed is set (sheet 5 procedure).
     The check gives feedback only. Readings always come from the solver, so wrong wiring
     behaves wrong on its own (blown fuse, needle pinned, no build-up) and nothing is faked.
5. **Consequences visible on the instruments.** Analog needles that pin backwards, fuses that
   blow, a breaker that trips, and a generator that stays at residual voltage.

## Experiments from the sheets

| Code   | Sheet                                                                  | Figure (circuit)                                                                                                                    | Table                                                                                      |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| DCM 01 | 1. Type of DC machine, coil determination                              | a) ohmmeter on each pair; b) 0–110 V DC + ammeter in series + voltmeter across coil; c) lamp in series with coil on AC socket       | R per coil by each method; Rf > Ra > Rs                                                    |
| DCM 02 | 2. OCC and magnetization curve: A) separately excited, B) self-excited | A) 220 V DC → rheostat → 1 A ammeter → F1–F2; voltmeter 0–300 V on A1–A2. B) F1–F2 → 1 A ammeter → rheostat → switch → across A1–A2 | Eo vs If 0…0.6 A; up **and down** (0→0.6→0) at 1400 rpm                                    |
| DCM 03 | 3. Speed vs induced voltage, separately and self-excited               | Same as DCM 02 A/B; prime mover 200–1500 rpm variable                                                                               | Eg vs N 200…1400 at If 0.5 A and 0.25 A; self-excited with If constant and with If varying |
| DCM 04 | 4. Critical resistance and critical speed                              | Same as DCM 02 A (at 750 and 1400 rpm) and B (1400 rpm)                                                                             | Eo vs If; Rc from the tangent; Nc = N1 · RT/RS                                             |
| DCM 05 | 5. Load test: separately and self-excited                              | DCM 02 circuit + switch → 6–12 A ammeter → variable load across A1–A2                                                               | IL 0…3 A: VL, Eg, If, Ia (Ra = 4 Ω given on the sheet)                                     |

The existing DCM 01 differs from the sheet: it uses 2–5 V and an extra variac AC method, and the
sheet uses 0–110 V up to half and full rated current, plus a lamp on the AC socket. It will be
rebuilt to match the sheet. Its discussion question 4 ("can you use an AC source?") can stay as an
optional step.

## Equipment the figures require

| Item                                                       | Seen in       | Needed from photos / lab                                           |
| ---------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| DC generator, terminal board                               | all           | **?** Terminal board layout (A1 A2 F1 F2 D1 D2, E1 E2?), nameplate |
| Prime mover (motor) + coupling, speed control 200–1500 rpm | 2–5           | **?** What drives it, how speed is set, tachometer type            |
| 220 V DC supply                                            | 2–5           | **?** Fixed or variable, sockets, protection                       |
| 0–110 V DC variable supply                                 | 1             | **?** Same unit as above?                                          |
| Field rheostat ("variable resistance", 1 A circuit)        | 2–5           | **?** Ohms, current rating, terminal layout (2 or 3 posts)         |
| DC ammeter 1 A (field)                                     | 2–5           | **?** Analog or digital, ranges, posts                             |
| DC ammeter 6–12 A (load)                                   | 5             | **?** Range switch?                                                |
| DC voltmeter 0–300 V                                       | 2–5           | **?**                                                              |
| Single-pole switch                                         | 2B, 3B, 4B, 5 | **?** Type and terminals                                           |
| Variable load (rheostat or lamp bank, up to 3 A)           | 5             | **?**                                                              |
| Multimeter DT810B (yellow)                                 | 1             | Sheet photo; replaces DT-9205A for this lab                        |
| Lamp + AC socket                                           | 1             | **?** Lamp rating                                                  |
| Leads                                                      | all           | **?** 4 mm banana / safety leads or screw posts? Colors used       |

## Physics the sheets depend on

The co-simulation from draft 1 still applies: each tick the bench is solved with the armature as
E = K·φ(If)·N in series with Ra, then speed and flux are updated. The sheets add these needs:

- **Residual magnetism**: the reading at If = 0 is nonzero (sheet 2, step 3).
- **Hysteresis**: the down curve lies above the up curve (sheet 2, table 2). A simple
  hysteresis model with a residual floor is enough. A pure single curve is not.
- **E ∝ N at constant If**: linear for separately excited, nonlinear for self-excited (sheet 3).
- **Self-excitation build-up** depends on field circuit resistance and speed: critical
  resistance Rc (tangent from origin) and critical speed Nc (sheet 4). These fall out of the
  OCC and the field L/R dynamics without being scripted.
- **Load drop**: VL = Eg − Ia·Ra (Ra = 4 Ω), with Ia = IL (separately excited) or IL + If
  (self-excited), plus armature reaction, so the self-excited curve droops faster (sheet 5).
- Speed is set by the prime mover. Generator load slows it slightly unless the student holds
  the speed constant, as each sheet asks.
- Coil values for sheet 1: Rf ≫ Ra > Rs, as in the existing model. Final values come from the
  nameplate and the OCC numbers (**?** past student results would help a lot).

## Phases (revised)

| Phase | Deliverable                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | **Wiring quality**: bend-point editing, net highlight, lead colors, readable stacks; analog DC meter with polarity |
| 2     | **Device faces from photos** (image + socket layout + editor) for the machine-lab devices                          |
| 3     | **Live schematic + wiring check** for the sheet figures (topology match and explained mistakes)                    |
| 4     | **Machine engine**: OCC with hysteresis/residual, build-up, load, prime mover; unit tests against sheet behaviour  |
| 5     | **DCM 01–05** steps, tables (matching the sheets' columns) and plots (OCC, Eg–N, external characteristic, Rc/Nc)   |
| 6     | Networks lab (waiting for its sheets)                                                                              |

Phases 1–3 need only the photos. Phase 4 needs the nameplate and, ideally, one set of real
readings to tune the curve.

## Still needed

- [ ] Photos: generator terminal board, prime mover and speed control, tachometer, DC supply
      panel, field rheostat, ammeters, voltmeter, switch, load, and the leads themselves
- [ ] Machine nameplate(s): kW, V, A, rpm, field current
- [ ] One set of real readings (OCC, load test) if available
- [ ] Lectures (for theory text and discussion answers)
- [ ] Confirm the meaning of "2D section" (assumed: devices from photos rather than hand-drawn art)
