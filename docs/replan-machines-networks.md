# Re-plan: DC machines and networks labs (draft, 21 Oct 2026)

Status: **draft, waiting for lectures, experiment sheets and device photos.** Sections marked
**?** are filled in from those materials; nothing marked **?** is modeled until confirmed
(same rule as [lab-inventory.md](lab-inventory.md)).

## Goal

Rebuild the DC machines lab and the networks lab as virtual benches: each real device
recognizable from its photo, wired with the same banana leads, and simulated from the wiring
alone (the bench never recognizes a "correct" circuit). Order: **DC machines first**, then
networks.

## What already exists (reuse, don't rebuild)

| Piece                                    | Where                                 | Reuse for                                  |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Leads, stacking, connectivity            | `domain/`, `electrical/connectivity/` | Everything, unchanged                      |
| Linear DC solver (MNA, CV/CC)            | `electrical/solvers/linear-dc.ts`     | Machine circuits (they are DC + resistors) |
| ngspice transient (AC, diodes)           | `electrical/solvers/ngspice/`         | Networks lab AC experiments                |
| Experiments, steps, tables               | `experiments/`                        | Every new sheet                            |
| DCM 01 terminal identification           | `equipment/machines.ts`, `catalog.ts` | Becomes the first machine-lab experiment   |
| NET 01 single-phase power                | `equipment/network.ts`                | Start of the networks lab                  |
| Wattmeter, cos φ, AC A/V meters, breaker | `instruments/panelMeters.ts`          | Networks lab                               |

## Track A — the "2D section" (faster device building)

**? To confirm what "2D section" means.** Working assumption: a faster way to put a real device
on the bench than hand-drawing its SVG artwork, which is today's bottleneck (`LabEquipment.tsx`
is ~1000 lines for a handful of devices).

Proposal: **photo-based device faces.**

1. Each device gets a cleaned, straightened front image (photo or flat illustration).
2. A small layout file places hotspots on it: sockets (terminal keys), knobs/switches
   (control keys + angle range), displays/needles (readout keys + region).
3. A generic `ImageDevice` renderer draws the image, overlays live sockets, knobs and
   needles/LCDs, and plugs into the existing `EquipmentDefinition` (terminals and components are
   unchanged, so the solver and experiments don't care how a device is drawn).
4. A dev-only **layout editor** (click on the image to drop a socket/knob, export JSON) so a
   new device takes minutes, not a day.

Outcome: adding a device = photo + layout JSON + electrical definition.

## Track B — DC machine simulation (the core new physics)

Electrical time constants (ms) are far faster than mechanical ones (seconds), so the machine
runs as a **co-simulation** on a fixed real-time tick (~1–5 ms, sub-stepped):

```text
each tick:
  machine states → network elements:   armature = E (= Kφω) in series with Ra (+ brush drop)
                                        field windings = resistors (Rf)
  solve the wired bench (linear-dc)  → Ia, If_shunt, I_series, terminal voltages, meter readings
  update machine states:
    field flux   φ = magnetization(If_shunt ± N_series·Ia, residual)   (+ field L/R lag)
    torque       T = Kφ·Ia
    speed        J·dω/dt = T − T_load(ω) − B·ω − T_friction
```

- **Magnetization curve** (open-circuit characteristic): saturating table plus **residual
  magnetism**. This gives self-excitation build-up, critical field resistance, and the classic
  "it won't build up" failure when the field is reversed or the speed is too low.
- **Series/compound fields**: cumulative vs differential compounding falls out of the sign of the
  series-field current, i.e. from how the student wired D1–D2.
- **Prime mover / load**: a driving motor (motor–generator set) or a brake/dynamometer, whichever
  the lab has (**?**).
- **Protection and hazards that must appear on their own**: starting current without a starter,
  a shunt motor **running away** when its field opens, a series motor running away unloaded,
  burnt fuses or tripped breakers. Speed is capped with a "machine damaged / emergency stop" state.
- Readouts: tachometer (rpm), analog DC ammeters/voltmeters with needle dynamics, a torque scale
  if there is a brake.
- Parameters per machine from its **nameplate** (kW, V, A, rpm, field current) (**?**);
  internal constants (Ra, Rf, J, curve) are fitted to the nameplate and documented as assumptions.

Why not ngspice for this: mechanical time constants of seconds would exceed the current
1.5 s / 10 s run limits, and students need to watch the machine accelerate live. The machine
circuits are resistive DC, which the in-browser MNA solver already handles at interactive rates.

## Track C — equipment to model (DC machines lab)

To be fixed from the photos. Typical items (**? confirm each**):

- DC machine(s): shunt / series / compound, terminal box A1–A2, E1–E2 (F1–F2), D1–D2
- Motor–generator coupling / prime mover; tachometer
- Variable DC supply (armature) and field supply; 220 V DC mains panel
- Starter (3- or 4-point), field rheostat, armature rheostat, load resistor bank / lamp load
- Analog DC ammeters and voltmeters (ranges), switches, fuses/breaker
- Brake or dynamometer for torque

## Track D — experiments (DC machines lab)

Filled in from the sheets. Expected candidates (**? confirm list and order**):

| Code   | Likely experiment                                       | Needs                                  |
| ------ | ------------------------------------------------------- | -------------------------------------- |
| DCM 01 | Terminal identification                                 | **Exists**                             |
| DCM 02 | Magnetization curve (OCC), separately excited generator | Machine model, prime mover, tachometer |
| DCM 03 | Load characteristic, separately excited generator       | + load bank                            |
| DCM 04 | Shunt generator self-excitation, critical resistance    | Residual magnetism, field L/R          |
| DCM 05 | Series / compound generator characteristics             | Series field coupling                  |
| DCM 06 | Shunt motor: starting, speed control (field & armature) | Starter, rheostats                     |
| DCM 07 | Motor load test / efficiency (brake test, Swinburne)    | Brake, loss model                      |
| DCM 08 | Series motor characteristics                            | Load must stay connected               |

Each experiment keeps today's pattern: steps checked from the wiring and readings, a results
table filled by **Record**, theory values from the sheet's formulas, plots (OCC, speed–torque,
efficiency) drawn from the recorded points.

## Track E — networks lab (after DC machines)

**?** Waiting for the sheets. NET 01 exists. Likely additions: three-phase star/delta loads, power
by the two/three-wattmeter method, power-factor correction, energy meter, and possibly a
transmission-line model. These run on the existing ngspice path plus new device faces from
Track A.

## Phases

| Phase | Deliverable                                                                                  | Depends on              |
| ----- | -------------------------------------------------------------------------------------------- | ----------------------- |
| 0     | Read lectures + sheets; fill the **?** above; final experiment list and equipment list       | Your materials          |
| 1     | `ImageDevice` renderer + layout editor; port one existing device to prove it                 | Meaning of "2D section" |
| 2     | Machine co-simulation engine (pure TS, unit-tested: OCC, build-up, runaway, steady states)   | Nameplate data          |
| 3     | DC machines lab devices from photos (machine, starter, rheostats, meters, tachometer, brake) | Photos                  |
| 4     | DCM 02 → DCM 0n experiments with tables and plots, one sheet at a time                       | Sheets                  |
| 5     | Networks lab devices and experiments                                                         | Sheets + photos         |

## What we need from the lab (checklist)

- [ ] Lectures and every DC machines experiment sheet (with result tables)
- [ ] Photo of each device: front, plus close-ups of terminals, dials and **nameplates**
- [ ] Meter ranges, rheostat ratings, starter type, supply voltages
- [ ] How the machines are coupled (M-G set? brake? dynamometer?) and how speed is measured
- [ ] Confirm what "2D section" means (see Track A)
