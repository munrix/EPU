# Architecture

## Boundaries

```text
profiles/ + experiments/ + equipment/ (definitions, commands)
                 ↓
app/ → bench/ → domain/ models and physical commands
                 ↓
electrical/connectivity/  physical nets from plugs, cables, links
electrical/circuit/       + instrument models → ElectricalCircuit; protection settling
                 ↓
electrical/solvers/linear-dc.ts → SimulationResult
                 ↓
instruments/ (display) + experiments/ (step checks) → bench readouts, guide, notebook
```

`domain`, `electrical`, `equipment`, `instruments` and `experiments` import no React or SVG APIs. Equipment positions and pure physical attachment coordinates belong to the domain. SVG curve routing belongs to the bench renderer.

`Workbench` (schema 3) is the versioned source of truth for equipment, component parameters, terminal identities, instrument settings, plug attachments, and cable properties. Camera, drag preview, selection, and panels are transient UI state. Commands produce new benches; a bounded 50-entry history supports undo and redo. Local saving is debounced, stored per experiment, and imports are schema-checked before committing.

## Equipment definitions

`equipment/registry.ts` holds each `EquipmentDefinition`: artwork kind, size, socket layout (`TerminalTemplate`), component templates with pin bindings, and parameter limits. `instantiateEquipment` derives terminal and component IDs from the instance ID (`r2.A`, `r2.resistor`), so any number of identical modules can share a definition.

On load, `parseBench` rebuilds every instance from its definition and requires the saved terminal and component sets to match exactly. Socket positions and labels come from the definition, not the file. Component values must stay within the definition's limits. The loader therefore hosts any bench made of known equipment for a known experiment, including open-bench layouts with added or removed modules.

Schema 1 and 2 files hold the Phase 1 inventory. They are rebuilt from the DC 01 bench while keeping equipment positions, source/load values, the meter range (via `migrateRangeId`), and every plug and cable.

## Physical connectors

Each cable owns exactly two plugs. An attachment targets a terminal, another plug's rear receptacle, or a loose position. Physical occupancy is one inserted plug per receptacle. Additional leads extend the stack, without an arbitrary depth limit. Imported files have resource limits (1,000 leads / 2,000 plugs / 40 equipment items).

The exposed target of an occupied terminal is its last plug. Mechanical attachment cycles and missing references are invalid. Electrically bad connections are valid physical operations and reach the solver.

Unplugging modifies only the selected plug's attachment; its children stay attached. Deleting a cable detaches children of its two plugs at their current positions. Removing a module leaves plugs in its sockets loose where they were, with their stacks intact. Geometry never implies an electrical connection.

## Electrical net construction

`buildCircuit` creates a disjoint-set graph of terminal and plug contacts and unions them across cable conductors, terminal attachments, plug-back attachments, and explicit internal links. Connected groups become electrical nodes, with IDs derived from sorted contact identities. Nodes are rebuilt after every edit, so removing a connection can split a net.

`assembleCircuit` then adds each instrument's electrical model for its current settings (see below). Instrument components are marked `origin: 'instrument'`, are never persisted, and may introduce internal nodes (flagged `internal`, hidden from the nodes panel).

## Instrument models

`instruments/multimeter.ts` defines the DT-9205A dial (32 positions, 11.25° apart) and `multimeterModel(meter, settings)`:

| Setting | Between sockets                                                             | Measurement                                    |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| DC V    | VΩ–COM 10 MΩ (`measurementInput`)                                           | V(VΩ) − V(COM), requires an external reference |
| Ω       | VΩ–COM: 1 V source + range reference resistor                               | V(VΩ) − V(COM), converted to R by the divider  |
| DC A    | mA–COM range shunt, 20A–COM 0.01 Ω                                          | current through the selected jack's shunt      |
| Always  | mA–COM shunt (1 Ω outside mA ranges) behind the 200 mA fuse; 20A–COM 0.01 Ω | —                                              |

Idealizations: the mA shunt value outside current ranges, the ohmmeter test voltage, and the absence of accuracy error and digit noise. The reading is formatted as 3½ digits (`OL` for V/A over range, a lone `1` for Ω as on the real meter).

**Protection.** `settleProtection` solves the bench, opens any fuse carrying more than its rating (by setting `fuseBlown`), and re-solves until nothing else trips. It runs inside every commit, so a trip belongs to the edit that caused it and undo restores both. Fuse timing (I²t) is not modeled; any steady current above the rating trips.

## DC solver

The `SolverAdapter` consumes an `ElectricalCircuit` and returns node voltages, signed branch currents, source regulation modes, measurement results, diagnostics, and the request revision.

Electrically coupled groups are found from active components; each receives its own mathematical reference (preferring an equipment source's negative node). References never create a shared earth. For each group, modified nodal analysis stamps resistor conductances, ideal voltage-source constraints, and current injections into a linear system solved by Gaussian elimination with partial pivoting (scale-relative pivot threshold).

**Bench supply regulation.** A source with `currentLimitAmps` is piecewise linear: solve in CV; if the delivered current exceeds the limit, switch that source to a CC current injection and re-solve; if a CC source's output would exceed its set voltage, return it to CV. The loop is bounded and failure to settle is a `solver-error`. A limited source whose terminals share a net (a dead short) is CC at 0 V from the start and reported as a `short-circuit` fault. A source without a limit keeps the Phase 1 ideal behavior: a short has no finite solution and produces a fault with no invented current.

**Diagnostics.** `short-circuit` (fault), `current-limit` (warning), `open-load` (warning: an equipment resistor in a powered group has no return path other than through voltmeter inputs), `floating-meter`, `ohmmeter-energized`, `invalid-parameter`, and `solver-error`. Numerical failures are never presented as shorts.

**Floating voltages.** A voltmeter reading is valid only when both leads connect through equipment components or conductors. A path only through the meter's own 10 MΩ input does not count, so a single connected lead reads “floating”, not a fabricated 0 V.

Resistor current is `(Va − Vb) / R`. Source current is positive into the positive terminal, so a sourcing supply has negative branch current. The UI shows delivered current.

React memoizes circuit construction on electrical state only (components, instrument settings, attachments). Equipment motion, cable color, and visual routing do not trigger solves.

## Experiments

`experiments/catalog.ts` defines each experiment: code, title, objective, theory note, initial bench factory, and steps. A step is a pure `check(ctx)` over a read-only `StepContext` (nets, stacks, supply state, meter display, component currents, `meterAcross`, `meterReads`), with an optional `record(ctx)` that captures the reading into the notebook.

Checks describe the physical configuration and the measured result, never the answer: `meterReads(I)` requires a valid DC current reading equal to the actual solved current, so a meter that is not in series cannot pass by coincidence. Validation is separate from simulation; a working circuit can still be the wrong circuit for a step.

The notebook (`app/useNotebook.ts`) latches a step the first time its check passes and stores it per experiment. It never modifies the bench.

## Transient adapter (ngspice)

Benches containing anything beyond resistors and DC sources (AC windings, capacitors, diodes, transistors) are solved by ngspice compiled to WebAssembly (`eecircuit-engine`, MIT; ngspice, BSD-3). The pipeline is split so every step except the engine call is pure and tested in Node:

- `planTransient(circuit)` finds electrically coupled domains, reports shorts and invalid values, and writes a netlist for the **live** domains only (those containing a powered source). Unpowered parts sit at 0 V and never reach the engine, which also keeps unwired boards (a diode between two empty sockets) out of the equations. Every node gets a 1 TΩ leak to ground so nodes behind capacitors or reverse diodes stay defined; protective earth, when present, is ngspice ground.
- Bench DC supplies are CV/CC: a smooth current clamp (`B = L·tanh((V − Vout)/(0.01 Ω·L))`) behind a 0 V current sense, with a 10 kΩ output bleeder ahead of the sense. Transformer windings are sine sources with 0.5 Ω winding resistance.
- The run settles for at least five mains periods (longer for large RC time constants, capped at 1.5 s), then records ten periods at 400 samples per period.
- `interpretTransient` maps vectors back to nets and components: waveforms, window means (as `nodeVoltages` / `componentCurrents`, so DC readouts keep working), RMS currents for protection, and `WaveStats` per measurement. The DT-9205A's AC ranges are average-responding and sine-calibrated (`π/2√2 × mean|v − mean|`), like the real meter.
- `client.ts` runs the engine in a Web Worker, loaded on first use. Requests carry a revision; while one runs only the newest waiting request is kept and superseded results are dropped. A watchdog terminates the worker after 10 s, because the engine can lock up on a pathological netlist.
- Fuses on transient benches are checked on RMS current after each result and folded into the edit that caused them.

Diagnostics added: `overcurrent` (a winding above its assumed 2 A rating, typically from two scope grounds on different points) and winding shorts.

## Oscilloscope

`instruments/oscilloscope.ts` models the UNI-T UTD2052CL: each channel is 1 MΩ from input to ground, and **all channel grounds are earthed** (terminal `earthed: true`), as is the bench's ±12 V common. Connectivity bonds every earthed terminal into one net, so two ground clips on different points short those points through earth, exactly as on the bench. The front panel (VOLTS/DIV, SEC/DIV, position, trigger level, DC/AC/GND coupling, AUTO, RUN/STOP, MEASURE) is display state, remembered per experiment. The screen draws real samples; the frontend never synthesizes a waveform.

## Results tables

Experiments may define `tables` mirroring the sheet: columns (frequencies, loads, or numbered slots such as Pair 1–3), rows with `capture(ctx)` for live readings and `derive(cells)` for calculated rows. `column(ctx)` says which column the bench is set up for; a prefix (e.g. `R`) fills the next free numbered slot, and `slotKey` reuses a slot already holding the same key (the same terminal pair). Recording is explicit (the Record button), stored in the per-experiment notebook, and never changes the bench. `theoryValues(ctx)` lists the sheet's ideal formulas beside the measurements.

Instruments added for the sheets: the oscilloscope's CH2-vs-CH1 phase (rising-crossing interpolation), dynamometer wattmeter (mean of v·i), cos φ meter (P ÷ VI with lead/lag), moving-iron ammeter and voltmeter (true RMS), and a mains breaker that trips on RMS current by switching its source off.

## Roadmap

Done: ngspice transient adapter (in-browser, worker), AC/nonlinear parts, the EPU bench panel, rectifier and transistor boards, UNI-T oscilloscope, DT-9205A AC ranges.

1. **More sheets.** Each new lab sheet becomes an experiment with its table; send them as they come.
2. **Large component trainer.** The wooden trainer box (op-amp, Zener, LDR, pot, diodes) once its handwritten values are confirmed (docs/lab-inventory.md).
3. **AC table equipment.** Decade R/L/C boxes, rheostats, wattmeters, the 0–5 A AC ammeter, three-pole switch.
4. **Meter completeness.** Diode test, continuity, capacitance and hFE; fuse I²t and 20 A duty limits.
5. **Second scope model.** ATTEN ADS1022C+ front panel on the same channel model.

A browser-only WebAssembly ngspice remains a separate evaluation, not a dependency.

## Current limitations

- SVG is appropriate for the bench sizes in use. Profile rendering and hit testing before adopting Canvas for larger inventories.
- Floating panels overlay the left of the bench; Fit bench and experiment switching frame equipment beside an open panel.
- Plug offsets make modest stacks visible; very large stacks need a dedicated stack inspector.
- Routing uses automatic Bézier slack. Manual bend points exist in data but are not edited by the UI.
- The shell is a local web app, not a packaged desktop application.
