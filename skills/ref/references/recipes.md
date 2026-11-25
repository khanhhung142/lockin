# Recipes

One section per kind of rule: the mechanism per stack, then the gotchas that bit earlier runs.
The shapes that worked before:

- Go: all checks in one test file, for example `internal/arch_test.go`, run with `go test ./internal/`.
- TS/React: lint rules in `.oxlintrc.json`, small `node --test` files such as `src/styles/tokens.test.mjs` and `scripts/check-version.mjs`, all wired into the `check` script in `package.json`.

## Layer and import rules

"Handlers only call logic", "pages never import the real API client", "model imports nothing internal".

- **Go**: a test that parses every non-test `.go` file with `go/parser` (imports only is enough) and checks each module-internal import against a per-layer allowlist.
  An allowlist ("handler may import logic, svc, types") catches new packages too; a denylist only catches what you thought of.
  A directory holding only `_test.go` files is a valid test package, so `internal/arch_test.go` can watch the whole module.
  `depguard` in golangci-lint works too when the repo already has a `.golangci.yml`; adding one changes the default linter set, so prefer the test when there is none.
- **TS/JS**: `no-restricted-imports` with `patterns` in eslint or oxlint, scoped by `overrides[].files` to the layer that must not import.
  `dependency-cruiser` only if it is already installed.
- **Java/Kotlin**: ArchUnit if present, otherwise a test over the source tree.
- **Python**: a test using `ast` over the package; `import-linter` only if already installed.

## Forbidden calls and required options

"Outbound HTTP carries the trace id", "only `src/api` calls `fetch`", "no `time.Now()` in domain code".

- **Go**: walk the AST for `*ast.SelectorExpr` (`http.Get`, `http.DefaultClient`) and for composite literals missing a key (`http.Client{}` without `Transport`).
  `forbidigo` covers the plain selector cases when golangci config exists.
- **TS/JS**: `no-restricted-globals` (for `fetch`, `XMLHttpRequest`) and `no-restricted-syntax`, with overrides that turn the rule off for the one place allowed to call it.

## Generated files match their generator

"Never hand-edit `routes.go`, `types.go`, the OpenAPI client, the protobuf output."

Regenerate into a temp dir and byte-compare only the generated files.

- Copy the module file (`go.mod`, `package.json`) into the temp dir first: generators derive import paths from it, and without it every import differs.
- Check the generator's exit code and print its output on failure.
  A spec file that the generator no longer parses is a real finding: the documented "edit the spec, regenerate" flow is broken.
- Hand edits usually exist for a reason (a global middleware, a prefix variable); move that code to a non-generated file (the `main`, a wrapper) before regenerating, then rerun the end-to-end check.
- Skip with a message when the generator binary is not on PATH.

## Tenant and security scoping

"Every query filters the tenant id", "tenant identity comes from the auth middleware, never the request".

- **Queries**: per function in hand-written data-access files, collect its string literals plus the literals of package-level constants and helper functions it references, so a query assembled from pieces is checked as a whole.
  If that text contains SQL (`select`, `update`, `delete`), require the tenant predicate (`` `cid` = ? ``).
  Derive which tables soft-delete from the migrations (`is_deleted` column) and require `` `is_deleted` = 0 `` for them; list tables owned elsewhere explicitly, with the reason.
  Skip generated model files; cover their by-id lookups by checking the caller re-verifies the tenant.
- **Request types**: find every type a handler parses a request into, walk its fields recursively, and fail on tags naming tenant or user identity (`cid`, `company_id`, `user_id`, `username`) in any binding (`json`, `path`, `form`, `header`).

## Migrations are append-only

- Name pattern: assert every file matches the documented pattern (for example `^\d{14}_[a-z0-9_]+\.sql$`).
- Immutability: `git diff --name-status --diff-filter=MDR $(git merge-base HEAD <base>) -- migrations/` must be empty.
  This compares the working tree, so it also catches uncommitted edits.
- Use the local base branch (`main`) when there is no remote; skip with a message when neither exists.

## Version bump per change

"Every commit that changes shipped code bumps VERSION."

A script that lists `git rev-list $(git merge-base HEAD <base>)..HEAD`, and for each commit touching shipped paths requires the version file in the same commit; then the same test on `git diff --name-only HEAD` plus untracked files.
Assert the version format too.
Only commits after the rule existed matter; check when the version file was introduced before calling old commits violations.

## Design tokens

"Colors and fonts come only from `tokens.css`."

- Scan CSS declaration values only (text after `:` on a line without `{` or `}`), so `#root` selectors and comments in selectors do not fire.
- Fail on hex colors, `rgb()`/`hsl()`, and `font-family` values other than `inherit` or `var(...)`.
- In TS/TSX, fail only on color-looking string literals (`'#fff1f0'`, `'rgba('`).
- A missing token is a design value: add it to the token file next to its palette with a comment saying where the value came from, and name it in the hand-over.
  Font sizes or spacings with no matching token are a design question, not a fix.

## Lint warnings

"Do not add lint warnings."

Fix the existing warnings, then make the linter fail on warnings (`oxlint --deny-warnings`, `eslint --max-warnings 0`).
Fixing warnings often changes runtime code (React state handling, module splits), so those fixes go through step 6 of the skill.
For React's `set-state-in-effect`, reset state during render when the inputs change ("adjust state when a prop changes") instead of at the top of the fetch effect.

## Gotchas

- `test_guard` blocks whole-suite runs, so the check command must be one package (`go test ./internal/`) or one script, never `go test ./...`.
- golangci's staticcheck wants raw strings for regexes; SQL with backticks then needs `"` strings, which is fine.
- A check that needs the network, Docker or a running database does not belong here; that is end-to-end verification.
- When the generator or base branch is missing in CI, a skip is silent there; say so in the hand-over.
