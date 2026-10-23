# Motor–Generator (M-G) set training rig (Esselte Studium, Sweden)

From the photos in [references/machine-lab](../../references/machine-lab/README.md). The panel
plate reads **ESSELTE STUDIUM, Nr 8000-?? (unreadable), MADE IN SWEDEN**. The DC machine carries an
**ASEA** nameplate, which is unreadable in the photos. No catalogue or manual was found online, so
the photos are the reference. **Confirmed** means read from a photo. **?** means a value is still
needed.

**What it is (confirmed by the lab): a Motor–Generator (M-G) set training rig.** A motor and a
DC machine sit on one bed, coupled shaft to shaft, and are treated as **one device** in the app:

- In the generator experiments (sheets 2–5), the motor is the prime mover that spins the DC
  machine, and the DC machine is the generator under test.
- The panel's MOTOR/GENERATOR toggle shows the same DC machine is also run as a motor in later
  experiments (with the torque scale), so the model must work in both directions on one shaft.
- Simulation: one shared shaft speed. Each tick, motor torque − generator load torque − losses
  sets the acceleration. Loading the generator therefore pulls the speed down, and the student has
  to hold the speed constant, as each sheet says.
- On the bench, the set is one large device: the motor's terminal box and the DC machine's
  terminal panel are both wiring points on it, and the coupling, shaft and speed meter are
  shown moving together.

## The set

```text
 [torque scale dial]                (above the DC machine; for the motor experiments later)
 ┌──────────────────────┐  coupling  ┌────────────────┐
 │  DC machine (ASEA)   │═══[▢]══════│ prime mover    │  ← terminal box on top, 4 mm sockets
 │  cradle-mounted      │            │ (3-phase motor │
 └──────────────────────┘            │  TEFC, fan)    │
 ┌─────────── terminal panel on the bed front ─────────┐
 │ [r/min ×100]  MOTOR(+)/GENERATOR(−)   F1 ─▭─ F2      │
 │                toggle                 A1 ─○─ A2      │
 │                                       D1 ─▭─ D2      │
 │                                       •  ─TG─ •      │
 │                                 ESSELTE STUDIUM      │
 └──────────────────────────────────────────────────────┘
```

## Terminal panel: inputs (confirmed from photo)

| Socket pair | Symbol printed between them | Winding                | Socket type                                     |
| ----------- | --------------------------- | ---------------------- | ----------------------------------------------- |
| F1 – F2     | filled rectangle            | Shunt field            | Black knurled 4 mm binding post (banana on top) |
| A1 – A2     | circle                      | Armature (via brushes) | Black knurled 4 mm binding post                 |
| D1 – D2     | filled rectangle            | Series field           | Black knurled 4 mm binding post                 |
| (unlabeled) | circle marked **TG**        | Tachogenerator output  | Smaller recessed sockets (2 mm or 4 mm **?**)   |

Layout as photographed:

- Two columns: the **1-terminals (F1, A1, D1) on the left** and the **2-terminals (F2, A2, D2)
  on the right**.
- The right column sits **lower** than the left, so each pair's joining line slopes down to the
  right.
- A raised grey strip runs down each column.
- Pitch is about one socket diameter × 2.4 vertically. Row order top to bottom: F, A, D, TG.
- The labels F1 and F2 sit above their sockets, and A1, A2, D1 and D2 sit above-left.
- Two screws are to the right of F2 and below the TG pair, and the plate name is at the lower
  right.

Other panel items:

| Item          | Photo shows                                                            | Behaviour to model                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed meter   | Square analog meter, cream face, "r/min ×100", scale 0–30 (0–3000 rpm) | Driven by the tachogenerator internally **?** (or students wire TG to it?). Needle reads the shaft speed.                                          |
| Toggle switch | "MOTOR +" up, "GENERATOR −" down                                       | **?** Most likely reverses the speed meter's polarity so it reads upscale whichever way the shaft turns. Wrong position = needle against the stop. |

**The inputs a student wires on this panel:** F1, F2, A1, A2, D1, D2 (and TG only if the speed
meter isn't wired internally). Six main sockets, matching the 6-terminal box in Experiment 1.

## Prime mover (confirmed from photo, details **?**)

- Totally enclosed fan-cooled motor with a terminal box on top carrying **4 mm sockets**. In
  the photo, red stackable plugs are inserted and stacked on each other.
- Visible sockets: two rows (the back row is plugged in). Probably **6 sockets (U1 V1 W1 / W2 U2
  V2)** for star/delta. **?**
- Rated speed fits a 4-pole induction motor (~1400 rpm, the sheets' "rated speed"). The sheets
  vary the speed from 200 to 1500 rpm, so there must be a speed controller. **?** What is it
  (frequency inverter, or is the prime mover actually a DC motor fed from a variable supply)?
- A flexible coupling (orange/black rubber elements) and a disc between the machines.

## Leads (confirmed)

- 4 mm banana leads with **stackable** plugs (a plug's back accepts another plug). This matches
  the bench's existing stacking model.
- Red leads are visible, plus a black one. **?** Which colors the lab has.

## Generator-lab instruments from the sheets (photos still needed)

220 V DC supply, field rheostat, 1 A DC ammeter, 6–12 A DC ammeter, 0–300 V DC voltmeter,
single-pole switch, variable load. See the plan,
[replan-machines-networks.md](../replan-machines-networks.md).

## Open questions for the lab

1. Nameplate of the ASEA DC machine (V, A, kW, rpm, field V/A) and of the prime mover.
2. How the speed is set (controller photo) and what the toggle switch does.
3. Is the speed meter wired to TG inside the panel?
4. Close-up of the prime-mover terminal box (labels on the 6 sockets).
5. Photos of the supply, rheostat, meters, switch and load used for experiments 2–5.

## Prime mover in the app (22 Oct 2026)

The lab confirms the prime mover runs from an **R S T** supply. In the app it now runs only when
it is wired, and nothing starts it except the wiring and the supply's breaker.

- **Terminal box on top of the motor:** six sockets in the IEC layout, **W2 U2 V2** behind and
  **U1 V1 W1** in front (windings U1–U2, V1–V2, W1–W2). The labels on the real box are not
  photographed (**?**).
- **Assumed rating plate:** 3~, 50 Hz, 1.1 kW, Δ 220 V / Y 380 V, 4.5 / 2.6 A, 1400 r/min, 4 poles.
  On 380 V R S T it must be connected in **star** (link W2–U2–V2).
- **Three-phase supply** (`three-phase-supply-v1`): R S T N sockets, 380 V between lines and 220 V
  to N, phase lamps, and a three-pole breaker. Where R S T really are on the bench is not known
  (**?**), so it is its own panel. The load switch can sit between R S T and the motor.
- **What the wiring does, computed from the winding voltages** (`src/electrical/circuit/polyphase.ts`,
  `src/machines/inductionMotor.ts`):
  - Star on R S T: runs forward at about 1490 rpm unloaded. Generator load slows it, following
    the motor's torque–speed curve.
  - Two phases swapped: runs backwards, so the generator's EMF reverses. The speed meter then
    reads only with its switch at MOTOR.
  - Delta on 380 V: each winding sees 381 V instead of 220 V, and a warning asks for star.
  - A phase missing: no starting torque, so the motor hums, and its locked-rotor current trips
    the breaker.
  - A lead between two of R S T N: short circuit, and the breaker trips.
  - A winding reversed, or the star point left open: handled the same way, from the winding
    voltages.
- **Speed meter switch:** GENERATOR reads forward rotation and MOTOR reads reverse. Driven the
  wrong way, the needle rests on its zero stop.

**Open question (decides sheets 3 and 4):** an induction motor on a fixed 50 Hz supply runs at
an almost fixed speed. The sheets set 1400 rpm and vary the speed from 200 to 1500 rpm (sheet 3)
and to 750 rpm (sheet 4). How does the lab change the prime mover's speed: a frequency
inverter, a variable three-phase supply, or a different drive?

## Speed control (23 Oct 2026, assumed)

Sheets 3 and 4 need 200–1500 rpm and 750 rpm, and sheets 2, 4 and 5 need 1400 rpm. An induction
motor on fixed 50 Hz turns at about 1490 rpm, so the bench has a **frequency inverter**
(`frequency-inverter-v1`, marked "assumed" on its panel), wired between R S T and the motor:

- **Wiring:** R, S, T → L1, L2, L3, then U, V, W → U1, V1, W1.
- **Controls:** 0–55 Hz by knob or typed value, RUN and STOP. The speed is about 30 rpm per Hz:
  47 Hz ≈ 1400 rpm, 25 Hz ≈ 750 rpm.
- **Control law:** V/f is held constant up to 50 Hz, so the motor keeps its torque at every speed.
- **Input fault:** with a phase missing at its input, it gives no output and the bench says why.

**?** Replace it when the lab's real speed control is known (it may be a different drive, a
variable supply, or a DC prime mover).
