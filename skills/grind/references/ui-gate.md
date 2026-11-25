# UI gate

A UI ticket is not `done` when the fields merely exist.
It is done when it is **correct AND readable**.
All fields present but visually cluttered is a gate failure, not a pass.

Run this gate inside the implementer subagent, before it reports done. Two parts:

## 1. Design quality (the anti-clutter gate)

If the feature dir has a `design-rules.md` (or the spec names one), it is the contract - enforce it. Otherwise invoke the `ui-ux-pro-max` skill and apply its standards (`design-taste-frontend` stays available as `/design-taste-frontend` for a landing or marketing page).

The ticket fails the gate unless the screen passes all of:

- **Hierarchy**: one clear primary action/number per view; secondary info visually subordinate (size, weight, colour), not competing. A wall of equal-weight fields is a fail.
- **Grouping & spacing**: related fields grouped with whitespace; unrelated ones separated. No dense uniform grid of inputs.
- **Progressive disclosure**: detail that isn't needed at a glance moves to a drill-through / secondary screen with a link, not crammed onto the main view. (Matches the "grasp in 3 seconds" intent from the specs.)
- **Consistency**: matches the existing screens' tokens - spacing scale, type scale, colours. No new ad-hoc styles.
- **States**: empty, loading, and error states exist and are not ugly.

## 2. Visual verify - inside the ticket, not trailing it

The slow runs built UI in hours 1-9 but screenshotted 6-16h later, so clutter and breakage surfaced at the very end. Pull the check into the ticket:

- Screenshot the screen you changed where your change shows, and compare it to the wireframe/design frame for this ticket. Be picky about pixels. Pick the views from what you changed, not a fixed matrix:
  - copy or strings: each locale the app ships, at desktop width;
  - layout, spacing or wrapping: desktop (1440px) and phone (390px);
  - colour, borders or a new style: light and dark;
  - otherwise: desktop, light, the default locale.
- The screen runs on the ticket's own mock if the real backend isn't ready yet - do the mock-based visual check now; leave only the real-backend smoke for when the backend half lands, and note it explicitly as the one deferred criterion.
- Any mismatch or clutter = fix before reporting done. Do not defer visual fixes.

Return in the implementer result: `ui_gate: pass` plus the viewports checked, or `ui_gate: fail` with what's wrong (which keeps the ticket out of `done`).
