# Shipping

**You own what lands. Verify each MR independently, land only the verified run from the bottom, then keep your hands off the stack.**
Every merge is irreversible and needs the user's go; one go may cover a named list of MRs.

1. Verify each MR independently.
   One verifier subagent per MR (`opus`, never the agent that wrote it) runs the change the way a user would on the local stack, parent against head, and writes `PASS`, `PASS+NOTES`, or `FAIL` with evidence to `.scratch/<feature>/verdicts.md`, keyed by MR and head SHA.
   Green CI and an approving review are not verdicts, because neither ran the change as a user would.
2. Find the landable run: walk up from the lowest unmerged MR and stop at the first without `PASS` or `PASS+NOTES`.
   The MRs below that point are the run, and the top one is the ceiling.
   A verified MR above an unverified one waits.
3. Check each verdict still describes the code: compare `git patch-id` at the verdict SHA with the current head.
   A patch that changed needs a fresh verdict; a change limited to tests, docs, or lint config keeps the verdict only if what the verifier ran builds the same.
4. Ask the user for the go on the run, listing each MR, its verdict, and head SHA.
5. Land bottom-up, one MR at a time, by the user in the GitLab UI or through the API merge endpoint with `GITLAB_TOKEN`.
   Read the MR back and confirm it reads merged into the integration branch, not into its parent's branch.
   Check the next MR now targets the integration branch; if not, retarget it, rebase its patch onto the merge result, and confirm its patch-id still matches its verdict before merging it.
6. Leave the stack alone while it lands; the step 5 retarget is the only change to a branch or base.
   If a merge stalls, find out why before changing anything.
7. Stop at the ceiling; extending the run starts again at step 1.

**Reply:** the verified run and its ceiling, each MR's verdict and who produced it, what landed and how you confirmed it, and what the next gap needs.
