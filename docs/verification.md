# Verification

The automated acceptance paths use browser pointer actions to construct the actual circuits. They do not prepopulate wiring to obtain an expected reading.

Verified on 22 September 2026 (Phase 2): production build passed, 53 engine/instrument/experiment/persistence tests passed, and 8 Chromium browser workflows passed. The primary acceptance browser run collected no runtime exceptions or console errors, and the asset check observed no external HTTP requests.

## Unit tests (`npm test`)

**Connectivity** — isolated sockets, component pins that never merge nets, true parent-child stacks, deep stacks, net splitting, independence from geometry and color, lifting stacks, deleting supports, reconnection, cycle rejection, permitted shorts.

**Solver** — 12 V / 1 kΩ gives 12 V and 12 mA (plus the meter's 1.2 µA input current); reversed probes; power off; floating and single-lead-floating probes; same-node probes; open returns; lifted stacks; independent islands; conflicting ideal sources as solver errors; invalid values.

**Supply regulation** — CC when the load exceeds the limit (10 Ω at 0.5 A → 5 V), CV below it, a short held at the limit at 0 V with a fault, and the ideal-source short with no invented current.

**DT-9205A** — series current including shunt burden (11.88 mA on 20m, 12.0 on 200m, OL on 2m), zero on a current range with leads in VΩ/COM, voltmeter loading (1 MΩ + 1 MΩ divider reads 5.71 V), fuse blowing across the supply, a lead left in mA shorting a load, the unfused 20 A input driving the supply into CC, resistance ranges and over-range `1`, an unpowered supply not disturbing Ω, the powered-circuit warning, and a switched-off meter whose shunts still conduct.

**Experiments** — every experiment's bench round-trips through persistence; an empty bench satisfies no step; DC 03 and DC 04 complete through real wiring with the expected notebook records (4/8/12 V and 18 = 12 + 6 mA); DC 02 requires a genuine series connection; a meter across the supply blows the fuse rather than passing a step.

**Persistence** — exact round trips, schema 2 migration (positions, values, leads, meter range), definition mismatches, definition-sourced socket layout, value limits, unknown experiments, cycles, missing references, double occupancy, and open-bench modules added and removed.

## Browser tests (`npm run test:e2e`)

1. DC 01 by mouse: stacked leads, 12.00 V, notebook record, solver readout, voltage change to 24 V showing `OL` until the 200 V range is selected, resistance change, CC at 10 Ω, supply short (CC at 1.000 A, fault banner), undo, reload persistence, reset and undo.
2. Meter reversal (−12.00), open return, reconnecting a loose plug, lifting and deleting a supporting stack.
3. Cancelled drags, keyboard wiring, equipment movement, zoom, fit, pan mode, help dialog.
4. Export/import round trip, rejection of a file whose equipment does not match its definition, undo/redo, no external requests.
5. DC 02: 20 mA range, series insertion, 11.88 mA, 5.94 mA at 6 V, both notebook records; DC 01's bench is intact after switching back.
6. Ammeter across the supply: fuse blows, message shown, undo restores the fuse, redo re-blows it, replacement.
7. DC 05: over-range `1` on 2k, 4.70 kΩ on 20k, powered-circuit warning, experiment complete.
8. Open bench: add a module, wire it, remove it (its plug is left loose), undo.

Browser verification runs on Chromium; cross-browser and touch-device certification are not claimed.

## Manual checks

1. In DC 01, build the circuit using the guide. Check 12.00 V, four leads, two stacked plugs.
2. Change source voltage, current limit and resistance independently; the solved circuit must respond. Drop the load to 10 Ω and watch the supply switch to CC.
3. In DC 02, leave the red lead in mA and try to measure voltage across the load: the supply goes into CC and the fuse blows. Undo.
4. Move equipment and zoom. All connected endpoints follow their sockets.
5. Unplug and delete supporting leads, and remove an open-bench module. Plugs must remain loose or attached to their lifted stack, never reconnect automatically.
6. Reset an experiment: unwired, unpowered bench and empty notebook; undo restores the previous bench.
