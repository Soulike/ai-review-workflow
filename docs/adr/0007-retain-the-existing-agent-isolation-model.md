# Retain the existing Agent isolation model

Review-result handling was revised by
[ADR 0008](0008-use-stateless-structured-review-results.md). The isolation
decision remains unchanged; the original decision is recorded below.

The initial workflow retains the existing gh-aw sandbox and broad Agent tool
capabilities rather than adding a custom execution-confinement layer. This
preserves reviewer capability while retaining the instruction that the reviewer
must not execute PR-provided code, including its scripts, tests, hooks, or
dependency-installation code. Running candidate tests belongs to the separate CI
workflow, not the reviewer.

The non-execution rule is an instruction within the existing isolation model,
not a claimed mechanical execution barrier. Sandboxing limits where code can
act; it does not make execution inside the sandbox inherently harmless or
replace publication authorization and review-result authentication.
