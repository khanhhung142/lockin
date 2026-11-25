# Spec phase - harden before you drive

Most "missed requirement" failures are born before Grind runs: in a spec built on a misunderstood core concept, or on sources that contradict each other. Drive faithfully builds whatever the spec says - so the spec is where to spend the care. This is guidance for the `/to-spec` + `/to-tickets` step; it does not replace those skills, it sharpens how you use them.

## 1. Lock the core concept's behaviour first

Before writing user stories, pin down what the system fundamentally *does*, in behavioural terms, and read it back to the user for confirmation. A label is not a definition: "model gateway" was accepted as a label and silently built as an access-checker when the user meant an OpenRouter-style proxy that itself calls the providers - the error survived a 3-hour grilling session and surfaced only on human review.

Use the `huddle` skill on the **core behaviour specifically**: "when X happens, what exactly does the system do, and who calls whom?" Do not move on from the core until the user confirms the behaviour, not just the name.

## 2. Collapse conflicting sources into one spec

The past runs shipped a 5-tier precedence stack (ADRs > docs > spec > ticket, plus wireframe-wins-over-spec) with known live contradictions (e.g. frontend guide vs ADR-0002 on where notices appear). Every contradiction handed to a subagent is a coin-flip on which it follows.

Resolve contradictions **at spec time**, with the user, into a single authoritative spec. The spec is the one source of truth the tickets derive from. If a source doc is wrong, fix it or mark it superseded - don't leave two live truths.

## 3. Settle business questions now, leave technical ones to the build

Carry this distinction into the tickets (the implementer brief enforces it at build time too):

- **Business** (what users see, do or pay; scope; UX; data meaning; permissions; perf budgets): settle every one you can find with the user at spec time. Each one left open becomes a `needs-human` stop mid-run.
  When the project's MR target is a release pattern such as `version/<xx>`, which release the feature ships in is one of these questions; write it in the spec.
- **Technical** (how to build it): leave it out of the spec. Implementers decide and log to `DECISIONS.md`.

## 4. UI is a first-class requirement, captured here

In the past runs UI philosophy (minimal-text, 3-second comprehension, red-box push) and information architecture (drill-through by entity) were injected by the user mid-session, not captured by the spec template. Capture them in the spec:

- the UI principles the screens must honour;
- the screen list / IA, with which detail lives on the main view vs a drill-through;
- a pointer to `design-rules.md` if one exists, so the UI gate has a contract.

Thin or absent UI acceptance criteria are why UI shipped cluttered and incomplete. Make UI acceptance criteria as concrete as backend ones.

## 5. Check the spec against the code it changes

A spec written from the contract, the ADRs and memory describes the system as it was. Before Gate 2, check two things on the base branch:

- **Every existing thing the spec names** (a screen element, field, dialog, endpoint, job): open the code that renders or serves it, not a contract description or an older doc, and confirm it is there. A story built on a price list picker the console had removed months earlier sent its ticket to `needs-human` mid-run.
- **Every new precedence or resolve rule, walked through existing data**: rows that already hold a value, and rows whose current source stops providing it later. Each outcome must match every user story. A resolve order that "never changes an existing price" still let a third-party source replace an official price once the official source dropped the model; a wave review found it, and it cost a decision, a fix ticket and a second fix after interrogate.
