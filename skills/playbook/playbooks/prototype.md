# Prototype

**You own the design decision, not the code.**
The prototype is a throwaway instrument; the real build follows `feature`.

Speed beats polish here, and code quality does not matter.
The rigor is in picking the right design cheaply: propose variations nobody asked for, throw an approach away and try another.

1. Scope the decision the prototype exists to make: which layout, interaction, or density, or for an empirical fork which behaviour, timing, or approach.
   No decision means no prototype; route to `feature`.
2. When the design space is open, gather references (prior art, Figma frames, competitor screens) and let the user pick directions before building.
   Skip this when the direction is set.
3. Build throwaway in `.scratch/<feature>/proto/`, outside production source.
   For a visual decision, plain HTML/CSS/JS or the lightest stack that renders the idea.
   For a behaviour or timing decision, the smallest script that exercises the question, against shared-infra if it needs data.
   No tests and no abstractions.
4. When comparing alternatives, put them behind one switcher (buttons or a keypress), each variant labelled.
5. Observe the thing you are deciding.
   For a visual decision, screenshot each variant with Playwright and drive the interaction.
   For a behaviour or timing decision, log the timing or print the output.
6. Present the alternatives, tradeoffs, and a recommendation, then hand the chosen direction to `feature`.

**Reply:** variants explored, evidence (screenshots or observed output), tradeoffs, recommendation, and the scratch path, stating plainly that the prototype is throwaway.
