# Laboratory electrical control and power supply console

From [references/machine-lab/control-supply-console.webp](../../references/machine-lab/control-supply-console.webp).
Only **one photo** exists (taken at an angle, from the front-left corner), so this page separates
what is **seen** from what is **assumed**. Assumptions are marked **A** and can be corrected by
anyone who knows the lab, without a new photo.

## What the photo shows

A blue steel cabinet, floor-standing (about knee-to-waist high), with a hinged blue lid on top and
a carrying handle on the left side. The back of the left side is open, and internal wiring is visible.

**Sloped front panel (grey):**

| Item                      | Seen                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Upper meter               | Analog, cream face, needle at zero; scale numbers faded; "DC" at the end of the scale                      |
| Lower meter               | Analog, white face, **"A"**, scale roughly 0 … 10 … 20 … 30 (**?**), "DC"; plate beside it reads "A-METER" |
| Socket pair by each meter | Two black 4 mm binding posts to the left of each meter (four in all)                                       |
| Large knob                | Blue knurled knob over a dial marked **0–100** (40, 50, 60, 70, 80, 90 legible), worn brown ring around it |

**Left side panel:**

| Item, top to bottom | Seen                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| AC outlet           | Cream double wall socket (two round-pin outlets)                                         |
| Lamps               | **Yellow** and **red** indicator lamps                                                   |
| Buttons             | **Red** pushbutton (round), **black** square switch beside the lamps                     |
| Sockets             | A block of black 4 mm binding posts in two columns (about 10), and more posts lower down |
| Second switch       | Black square switch to the right of the socket block                                     |
| Handle              | Chrome handle                                                                            |

## Confirmed by the lab (21 Oct 2026)

- The big knob sets a **DC voltage**.
- On the side panel, the **left** sockets give **220 V** and the **middle** ones give **110 V**.
- **All sockets are black.**
- Not known: whether the console starts the prime mover, the front meters' ranges, and the
  separate meters' looks.

In the app (`supply-console-v1`): the knob's output is 0–220 V DC on the two posts beside the
front voltmeter, and the front V and A meters read that output. The side block has 220 V DC
(left column, + above −) and 110 V DC (middle column). START and STOP switch every output, and
the yellow lamp shows mains and the red lamp shows outputs on. The other posts are drawn but dimmed
until their use is known.

## What it most likely does (assumptions, **A**)

This console is what the sheets call "**220 V D.C supply**", and it powers the prime mover.

| #   | Function                                                                                                           | Basis                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| A1  | **Variable DC output, 0–220 V** (rectified from a variac), set with the big knob (0–100 % of the dial)             | Big 0–100 dial; both meters marked DC; sheets need 220 V DC and 0–110 V DC                                             |
| A2  | Upper meter = **DC voltmeter** on the output, lower meter = **DC ammeter** (A-METER) on the output                 | Plates "A" / "A-METER"; meters sit beside the output posts                                                             |
| A3  | **Fixed 220 V DC** (field supply) on two of the side posts                                                         | Sheets 2–5 feed the field from "220 V DC" while the speed is set separately                                            |
| A4  | **3-phase AC** for the prime-mover motor on side posts (L1 L2 L3, N, PE), with the red/black buttons as STOP/START | M-G set needs a supply for its motor; red and black buttons and yellow and red lamps are a usual contactor arrangement |
| A5  | Yellow lamp = mains on, red lamp = output on (or contactor closed)                                                 | Usual convention                                                                                                       |
| A6  | Single-phase outlet: 220 V AC for the test lamp (sheet 1 method 3)                                                 | Sheet 1 plugs a lamp into an AC socket                                                                                 |
| A7  | Protection: a breaker or fuses inside (unseen); overload trips the output                                          | Needed for safe failure behaviour                                                                                      |

**Open point that matters for the physics:** the sheets vary the generator speed from 200 to
1500 rpm. If the prime mover is an induction motor on fixed 3-phase AC, its speed is almost
constant (about 1400–1450 rpm). Then either (a) the console has a speed controller (the big knob?)
or (b) the prime mover is actually a DC motor fed from the variable DC output. **Which one decides
how speed is controlled in the app.**

## App model

One equipment item, drawn from the photo, with the **front panel and side panel unfolded side by
side** so every socket is reachable. Wiring points and controls:

- Output posts beside the meters, with the meters reading the console's own output (A1, A2).
- Side socket block: one labeled group per supply (A3, A4). Labels are shown on the bench even
  if the real plate is worn, because the student needs them to wire correctly.
- START (black) and STOP (red) buttons, and lamps that light from the real state.
- The big knob turns 0–100 and sets the variable output. It is ramped, as on a variac, and the
  meters follow.
- Outlet: one double socket that the sheet 1 lamp plugs into.
- Fault behaviour from the physics: a short on an output trips the protection and the lamp goes
  out, a wrong post gives no voltage, and the ammeter reads the output current, never a scripted
  value.

## Questions for someone who knows the lab (no photo needed)

1. What does the big knob control: the DC voltage, or the prime-mover speed?
2. Which sockets on the side give 220 V DC (fixed?), the variable DC, and the 3-phase supply for
   the motor? Roughly how many sockets are in each group, and what color are they?
3. Is the prime mover started with the red/black buttons on this console?
4. Ranges of the two front meters (for example 0–250 V and 0–20 A)?
5. Are the separate meters in the sheets (1 A, 6–12 A, 0–300 V) loose instruments on the table?
   If so, roughly what they look like (analog, size, color).
