# Lab inventory (from photographs, 22 Sep 2026)

## Implemented so far

| In the app                                                         | From                                 | Assumptions still to confirm                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lab bench panel** (`epu-bench-panel-v1`)                         | Grey steel panel photos              | One ON/OFF switch powers every output. Variable supply 0–30 V (confirmed) with a 1 A limit. Two fixed 12 V outputs form a ±12 V pair whose common is earthed. Transformer 12 V RMS per winding (confirmed), 50 Hz (confirmed), windings U–X, V–Y, W–Z isolated, 0.5 Ω, 2 A rating. R S T lamps are indicators only. |
| **Rectifier board** (`rectifier-board-3ph-v1`)                     | Red-socket board, 7 columns          | Diodes point up (anode on the lower socket), 1N4007. Electrolytic + on top. Rows 2 and 3 of the diode columns are not joined internally.                                                                                                                                                                            |
| **Transistor board** (`transistor-board-v1`)                       | Black-socket board                   | Capacitor 10 µF; transistor BC547B; the 1 kΩ and C are separate sockets.                                                                                                                                                                                                                                            |
| **UNI-T UTD2052CL** (`utd2052cl-v1`)                               | Scope photos                         | Inputs reached through BNC-to-banana adapters; ×1 probes.                                                                                                                                                                                                                                                           |
| **DT-9205A**                                                       | Earlier reference                    | Chosen as the bench meter (the lab mixes models).                                                                                                                                                                                                                                                                   |
| **Function generator** (`function-generator-v1`)                   | R-L / R-C sheets                     | Not photographed. 50 Ω output, earthed output ground, sine, 10 Hz–100 kHz, up to 10 Vpp open circuit.                                                                                                                                                                                                               |
| **Decade R / L / C boxes**                                         | Equipment table photo                | 0–99 999 Ω; 0–999 mH with 5 Ω winding; 0–9.999 µF. Dial layout simplified.                                                                                                                                                                                                                                          |
| **Single-phase supply** (`mains-supply-v1`)                        | Network sheet, Lindner breaker photo | 220 V 50 Hz, 0.3 Ω source, neutral earthed, 6.3 A breaker trips on RMS overload.                                                                                                                                                                                                                                    |
| **Wattmeter, cos φ meter, AC ammeter 0–5 A, AC voltmeter 0–300 V** | Equipment table photo, network sheet | Current coils 0.05 Ω / 0.02 Ω; voltage coils 20 kΩ / 10 kΩ. Scales 0–1200 W and 0.5 lag–1–0.5 lead are assumptions.                                                                                                                                                                                                 |
| **Rheostat, inductive and capacitive loads**                       | Network sheet                        | 10–300 Ω; 0.2–1.5 H with 10 Ω; 2–40 µF.                                                                                                                                                                                                                                                                             |
| **DC machine terminal box**                                        | DC machines sheet                    | Armature 2.5 Ω / 20 mH, series field 0.8 Ω / 5 mH, shunt field 220 Ω / 20 H; three internal wirings. Brush fluctuation when turning the shaft is not modeled.                                                                                                                                                       |
| **Test lamp, variac**                                              | DC machines sheet                    | 100 W lamp at its hot resistance (484 Ω); variac 0–250 V, floating output.                                                                                                                                                                                                                                          |

What the real EPU lab benches contain, as far as the photos show. Anything marked **?** is unreadable or not visible and must be confirmed before it is modeled. Socket layouts may be copied from photos; **internal connections and values may not be guessed** from artwork.

## Bench: fixed panel (grey steel, per student position)

| Item                          | What the photo shows                                                                                    | Needed to model                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Variable DC supply            | Analog voltmeter 0–60 V, one knob, black − / red + banana sockets, label “?0 V D.C” (0–30 V or 0–60 V?) | Range, current limit / fuse, is − floating or earthed?                                                                                      |
| Fixed DC supplies             | Two outputs labelled “12 V D.C”, each − (black) / + (red). A drawn line with an earth symbol joins them | Are they a ±12 V pair with a common 0 V? Is that 0 V earthed?                                                                               |
| ON/OFF toggle                 | Toggle switch with red LED above                                                                        | What it switches (all DC outputs? AC too?)                                                                                                  |
| 3-phase transformer secondary | “T.R 12.6 V A.C”: U V W (yellow) and X Y Z (green)                                                      | 12.6 V per winding (U–X, V–Y, W–Z)? Phase or line voltage? Frequency (50 Hz?). Are X Y Z free (six-terminal) so students choose star/delta? |
| Single-phase low-voltage AC   | “6.3 …” yellow/green sockets at the right edge of the panel                                             | Voltage, which winding                                                                                                                      |
| Mains indicators              | R, S, T digital voltmeter lamps (red/yellow/green), fuse holder under each                              | Display only? Are R S T available as sockets anywhere?                                                                                      |
| Breaker                       | Lindner LMS/M 6.3 A miniature breaker                                                                   | Protects what?                                                                                                                              |

## Plug-in boards

**A. Three-phase rectifier board** (red sockets, 7 columns × 4 rows, screwed onto the panel)

- Columns 1–3: two diodes each (row 1→2 and row 3→4). Six diodes, as for a three-phase bridge or half-wave.
- Column 4: 100 µF capacitor (rows 1–4). Column 5: 10 µF capacitor. Column 6: 1 kΩ. Column 7: 10 kΩ.
- **?** Diode orientation per column (the symbols look anode-down on top but need confirming), diode part number (1N4007?), capacitor voltage ratings and polarity marking, whether rows 2 and 3 are joined internally.
- Implemented as `rectifier-board-3ph-v1` with every part simulated (replacing the earlier resistor-only version).

**B. Transistor board** (black sockets)

- Capacitor (value **?**), 10 kΩ, 1 kΩ (vertical, top right), NPN transistor with B, C, E sockets.
- **?** Capacitor value, transistor part number (BC547? 2N2222?), and whether the 1 kΩ is internally tied to C.

**C. Large component trainer** (wooden box, black / red / yellow sockets)

- Top: six diodes, each between two black sockets (3 rows × 2).
- Red section: a capacitor (“100…?”), a 1 kΩ resistor, a “10 k” part with a paper arrow (a potentiometer?), and an **op-amp** (triangle with −/+ inputs, output, +Vcc/−Vcc sockets) with a 1 kΩ and a 10 kΩ resistor beside it (an inverting amplifier, gain −10?).
- Black right section: a light-dependent part (LDR or photodiode **?**), 100 µF, 10 µF, 390 Ω, a Zener diode (voltage **?**), and a “10 K” part at the bottom right (pot or thermistor **?**).
- Yellow section: 1 kΩ, a capacitor (value **?**), and a small three-socket part at the bottom (**?**).
- The sheet beside it asks for Vdc, Idc, Irms, Vrms, rectification efficiency and ripple, so this is a rectifier experiment.

## Instruments

| Instrument              | Details from photos                                                                                                                                                                                   | Notes                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| UNI-T UTD2052CL DSO     | 50 MHz, 500 MS/s, CH1 (X), CH2 (Y), EXT TRIG, probe comp ≈3 V 1 kHz, inputs 1 MΩ ≈ 24 pF, 400 Vpk CAT II, F1–F5 soft keys, MEASURE / ACQUIRE / STORAGE / CURSOR / DISPLAY / UTILITY / RUN-STOP / AUTO | A BNC-to-banana adapter is used on CH2. The channel grounds are common and tied to mains earth. This matters: it can short a rectifier. |
| ATTEN ADS1022C+ DSO     | 25 MHz, 500 MS/s, color screen, 2 channels, MEASURE shows Vpp / Freq / Prd / Mean                                                                                                                     | A second scope model is in use                                                                                                          |
| Handheld DMMs           | Red UNI-T meters (“10 A MAX 10 sec each 15 min UNFUSED”, “200 mA MAX FUSED”), UNI-T true-RMS meters, a VICTOR VC-series meter, DT-9205A style black meters                                            | Which one does each student actually use?                                                                                               |
| Analog wattmeters       | Grey multi-range W meters (several binding posts)                                                                                                                                                     | Range posts and ratings **?**                                                                                                           |
| AC ammeter              | Seppo Hyvönen, 0–5 A AC, moving iron                                                                                                                                                                  | —                                                                                                                                       |
| Digital panel meter box | Grey box with LCD, red / black / red sockets                                                                                                                                                          | What it measures **?**                                                                                                                  |

## Passive and switching equipment (AC lab table)

- Decade resistor boxes (grey, 6–7 dials each), decade inductance boxes (blue, ×100 mH / ×10 mH / ×1 mH), decade capacitor boxes (green, ×1 µF / ×100 nF / ×10 nF …).
- Sliding rheostats (tubular, two sizes).
- Three-pole switch (hps 2232, 500 V ~ 16 A).
- A grey trainer box with a printed network diagram (top right of the table, **?**).
- AC transformer / regulator trainer boards behind the scopes: T1/T2 220 V → 12 V / 9 V, bridge BR1, µA7805 regulator, 5 V DC output.

## What this means for the app

1. Almost everything here is **AC or nonlinear**: diodes, rectifiers, the three-phase transformer, op-amp, BJT, capacitor ripple, oscilloscopes. The in-browser linear DC solver cannot and must not fake these. The ngspice step in the roadmap is now the critical path.
2. The oscilloscope must model **earthed, common channel grounds**. Probing a bridge rectifier with both channels referenced to different points is a classic real short, and the app should show it.
3. Replicating a bench needs three things per item: a photo (layout), confirmed values, and confirmed internal wiring. The **?** items above are the list to confirm.
