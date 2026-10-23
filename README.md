# EPU Lab — Virtual Electrical Workbench

A reusable electrical engineering laboratory that prioritizes **physical wiring practice**: instruments with banana sockets, flexible leads, and explicit stackable plug attachments. Electrical behavior is derived only from those connections — the bench never recognizes a "correct" circuit and substitutes an answer.

- **Phase 1** (done): SVG workbench, stackable leads, independent connectivity engine, small linear DC solver.
- **Phase 2** (done): real instrument behavior and a set of guided DC experiments — see below.
- **Phase 3** (done): your real lab bench. ngspice runs in the browser for AC, diodes and transistors; the EPU bench panel, rectifier and transistor boards, and the UNI-T oscilloscope are reproduced from photographs ([lab inventory](docs/lab-inventory.md)).
- **Phase 4** (done): the lab's experiment sheets as guided experiments with results tables (below).
- **Next**: see [architecture](docs/architecture.md#roadmap).

## Run locally

Use Node.js 22.12+ (verified with Node 24) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. No account, cloud solver, API key, or internet connection is needed after installing dependencies. Fonts are bundled locally. A desktop-sized browser is recommended.

```sh
npm run build       # TypeScript checks and production build
npm test            # Connectivity, solver, instrument, experiment and persistence tests
npx playwright install chromium
npm run test:e2e    # Real browser mouse/keyboard workflows
```

## Your lab experiments (from the lab sheets)

| Code   | Sheet                                                                                    | Bench                                                                                                           | Results table                                                                                         |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PE 04  | Power electronics exp. 4: three-phase full-wave rectifier                                | LAB 1 panel + rectifier board, scope, AVO                                                                       | Vdc, Vrms, ripple, f, then Idc, Irms, η, form and ripple factors; theory from the sheet’s formulas    |
| AC 01  | A.C. circuits exp. 1: R-L series (560 Ω, 72 mH, 10 Vpp)                                  | Function generator, decade R/L/C boxes, DT-9205A, UNI-T                                                         | F × VR, VL, φ, XL                                                                                     |
| AC 02  | A.C. circuits exp. 2: R-C series (1 kΩ, 0.5 µF)                                          | Same                                                                                                            | F × VR, VC, φ, XC, Z                                                                                  |
| NET 01 | Electrical network exp. 1: power in single-phase circuits (220 V)                        | Supply with 6.3 A breaker, wattmeter, cos φ meter, ammeter, voltmeter, R/L/C loads                              | Two readings per load: W, cos θ, I, V, IV cos θ                                                       |
| DCM 01 | DC machines exp. 1: terminal identification                                              | Unlabeled 6-terminal box (three internal wirings), two DT-9205A, lamp, 220 V, DC supply, variac                 | One table per method: ohmmeter, series lamp, DC V/I, AC V/I                                           |
| DCM 02 | DC machines exp. 2: open-circuit and magnetization curves (A separately, B self-excited) | Esselte Studium M-G set, supply console (220 V DC), field and load slide rheostats, load switch, three DT-9205A | Eo vs If 0–0.6 A, and the up–down loop, for each part                                                 |
| DCM 03 | DC machines exp. 3: speed vs induced voltage (A separately, B self-excited)              | Generator bench + frequency inverter (speed 200–1400 rpm)                                                       | Eg vs N at If = 0.5 and 0.25 A; self-excited with If held and with the rheostat fixed                 |
| DCM 04 | DC machines exp. 4: critical resistance and critical speed                               | Generator bench + inverter (1400 and 750 rpm)                                                                   | Eo vs If with Eo ÷ If (critical resistance); self-excited curve; speed at which the voltage collapses |
| DCM 05 | DC machines exp. 5: load test (A separately, B self-excited)                             | Generator bench: load switch, 6–12 A ammeter (meter3), load rheostat                                            | IL 0–3 A: VL, If, IL, then Ia and Eg = VL + Ia·Ra (Ra = 4 Ω)                                          |

Measured results go in with the guide’s **Record** button, exactly like writing a reading onto the sheet; derived rows (XL, Z, η, P = IV cos θ…) are calculated from your recorded numbers. The theory list beside it uses the sheet’s own formulas, so the difference between the two (generator resistance, diode drops, meter loading) is the discussion.

## Lab benches

| Code  | Bench                   | Equipment                                                                                                                                   |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| LAB 1 | Power electronics bench | Steel panel (0–30 V, ±12 V, 3-phase 12 V transformer U V W / X Y Z, R S T indicators), six-diode rectifier board, DT-9205A, UNI-T UTD2052CL |
| LAB 2 | Transistor bench        | Same panel with the BC547 transistor board                                                                                                  |

The ON/OFF switch powers every output on the panel. Scope channel grounds and the ±12 V common are earthed: two grounds on different points short them together, as on the real bench. Boards can be swapped from the guide's drawer. A 3-phase bridge on 12 V windings gives about 26.6 V DC with 300 Hz ripple; the first simulation takes about a second while ngspice loads.

## Experiments

Choose an experiment from the header. Each keeps its own bench and lab notebook on this device.

| Code  | Experiment                       | What the student learns                                                                                     |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| DC 01 | Your first closed circuit        | Wiring a loop; stacking meter leads on the backs of plugs; 12.00 V across 1 kΩ.                             |
| DC 02 | Measuring current in series      | Moving the red lead to mA, breaking the loop, shunt burden (11.88 mA on the 20 mA range), Ohm's law at 6 V. |
| DC 03 | Series circuit & voltage divider | V across R1 and R2, KVL: 4 V + 8 V = 12 V.                                                                  |
| DC 04 | Parallel branches & KCL          | Total and branch currents: 18 mA = 12 mA + 6 mA.                                                            |
| DC 05 | Measuring an unknown resistor    | Ohmmeter range selection (Rx = 4.70 kΩ on 20k), and why power must be off.                                  |
| OPEN  | Open bench                       | Free practice; add up to eight resistor modules from the equipment drawer.                                  |

The guide's **notebook** records a reading the first time a step is achieved. Later rewiring does not erase it; Reset clears it.

## Instruments

**DC power supply (CV/CC).** Set voltage (0–60 V) and current limit (0.001–5 A) by typing or with the knobs. The supply holds its voltage (CV) until the load demands more than the limit, then holds the limit (CC) and its voltage drops. A dead short shows CC at 0 V and a fault banner. OFF opens the output; it is never a 0 V short.

**DT-9205A multimeter.** The dial changes the electrical model inserted between the sockets, not just the display:

- **DC V** — 10 MΩ between VΩ and COM, so high-impedance dividers show real loading. Over range shows `OL`.
- **DC A** — the mA socket reaches COM through the range shunt (1 Ω on 200 mA … 1 kΩ on 200 µA) and a **200 mA fuse**; the 20A socket is an unfused 0.01 Ω shunt. The shunts are always there, so a lead left in a current socket shorts whatever it touches.
- **Ω** — a 1 V test source behind the range reference resistor. Open leads or over range show a lone `1`. On a powered circuit the reading is flagged as meaningless.
- AC, capacitance, diode and hFE positions are marked as not simulated.

An ammeter across the supply blows the fuse. The trip is part of the same edit, so **undo restores the wiring and the fuse together**. Otherwise replace it from Readings or the meter's selection bar.

## Interactions

- Drag from sockets or the back of plugs to create leads. Occupied sockets target the exposed rear of their plug stack.
- Choose from ten lead colours. Colour has no electrical effect. Next to the colours, **Paint every lead** recolours all leads in the chosen colour, **Each lead a different colour** gives every lead its own colour, and **Straight runs** lays every lead in tidy right-angled runs (press again for hanging curves).
- **Cable management:** select a lead, then drag it anywhere to pull out a bend point. Bend points snap to a 20 px grid so neighbouring leads line up; hold **Alt** to place one freely. Drag a bend point to move it, and double-click it to remove it. The selection bar switches that lead between **Curved** and **Straight** and has **Clear bends**. Bends and colours never change the circuit.
- Drag equipment by its top handle. Drag empty bench space to pan; scroll or use the toolbar to zoom; Fit bench frames everything beside an open panel.
- Select a cable on the bench or in **Connections**. Unplug either end using **End 1 / End 2**, or delete the lead.
- Unplugging a base plug lifts its child stack intact. Deleting a supporting lead or removing a module leaves plugs loose. Nothing is silently reparented to a terminal.
- Keyboard wiring: focus a socket and press Enter, then focus the destination and press Enter.
- Undo/redo via toolbar or Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z. Delete/Backspace removes a selected cable or open-bench module. G toggles the guide.
- Benches save locally per experiment. Import/export preserves physical attachments in a versioned JSON file (schema 3; schema 1 and 2 files migrate). Invalid imports leave the current bench unchanged.

## Deliberate limits

Not a full safety or device model: no heating, fuse I²t timing, 20 A duty-cycle limits, or supply over-voltage protection. Transformer, supply and board values not visible in the photos are assumptions listed in the lab inventory. The meter's accuracy spec and last-digit noise are not modeled. ngspice runs in the browser (WebAssembly, loaded on first use); no desktop installer is bundled. Panel artwork is illustrative until actual laboratory photographs and electrical mappings are provided.

See [architecture](docs/architecture.md) for layer boundaries, electrical conventions and extension points, and [verification](docs/verification.md) for the acceptance checks.
