---
name: upgrade-gh-aw
description: Assess and carry out gh-aw upgrades for this repository. Use before proposing or implementing a gh-aw or compiler-selected review runtime upgrade, including compatibility fixes during the upgrade.
---

# Upgrade gh-aw

Follow the user's assessment or implementation scope and agreed completion
boundary. An upgrade request does not authorize choosing a response to a newly
discovered permission change.

## 1. Establish the baseline

Resolve the repository links below relative to this `SKILL.md`. Check those
locations before reporting a baseline document as unavailable.

Read [CONTRIBUTING.md](../../../CONTRIBUTING.md), the
[glossary](../../../GLOSSARY.md), relevant [ADRs](../../../docs/adr/), and the
[consumer guide](../../../docs/consumer-setup.md). Reuse current, already-read
material. Follow the [issue instructions](../../../docs/agents/issue-tracker.md)
before reading historical blocker issues; record each blocker's actual failure
condition and the evidence required to consider it fixed.

Inspect the pinned compiler, its selected runtime dependencies, authored review
source, generated workflow, public wrapper, and callers, including self-review.
Identify consumer repositories, the refs they follow, their permission ceilings,
and required checks. Record gaps in consumer coverage explicitly.

## 2. Explain the semantic changes

Verify the latest stable release from upstream. Compare the exact old and target
tags, release notes, implementation, and isolated compilation output. Establish
which runtime versions the target actually selects; a dependency's independent
release does not establish that gh-aw uses it.

Explain **old behavior → upstream change and reason → effect on this workflow**.
Review job dependencies and gates, token permissions, diagnostic tools, result
and artifact contracts, model/client compatibility, and network/runtime defaults.
When reporting new models, distinguish client support from provider/account
availability and verify compatibility with the workflow's selected engine and
launcher. Resolve historical blockers against these exact versions and paths.

Classify existing settings as explicit workflow requirements, inherited defaults,
or temporary workarounds. Evaluate upstream's design before selecting a response.
Recommend inheritance, a justified customization, workaround removal, or caller
migration with its consequences. Preserve accepted workflow requirements and
surface conflicts with ADRs; neither an old setting nor a new default settles
the decision by itself.

## 3. Stop at permission changes

Compare old and target effective permissions across the complete caller → wrapper
→ generated job chain, including the job that holds each token. Apply this step
to added, removed, or tightened permissions and changes of token holder, even
when a caller already grants enough permission.

Check declared permissions against caller ceilings first, using
[GitHub's nested-workflow permission rules](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#access-and-permissions-for-nested-workflows).
A callee requesting a scope above a caller's ceiling is a call-compatibility
blocker, independently of whether that code path runs or catches API errors.
Only then assess runtime behavior; best-effort error handling does not establish
that the workflow call is valid.

Before choosing a fix, trace each change to its upstream implementation:

- Identify the operation, resource, trigger, and purpose requiring the scope.
  Assess whether the permission is necessary for that behavior and whether the
  behavior is necessary for this workflow. Explain what disabling it would lose.
- Check every known caller's effective grant and followed ref. Distinguish
  workflow-load rejection from a conditional runtime failure, and explain which
  runs fail, at what stage, and why. Report unresolved evidence as unresolved.
- Report the old and new job/scope, upstream rationale, necessity assessment,
  downstream impact, alternatives and tradeoffs, recommendation, and rollout
  order. Name affected repositories and any coverage gaps.

**Stop after this report until the user selects the response to that permission
change and its downstream impact.** Read-only investigation and isolated
compilation can continue. Preserve existing work. Do not disable upstream
behavior, override compiler permissions, widen caller grants, or publish a
remediation to make the mismatch disappear on your own authority.

Reuse an explicit choice already made after this exact change and its impact
were reported; do not ask for it again. A general upgrade authorization or a
passing compilation is insufficient. Report and stop again if further evidence
introduces a different permission change or broader downstream impact.

## 4. Implement and verify the selected response

Continue only within the authorized scope after any permission decision above.
Use CONTRIBUTING.md for editing, compilation, generated ownership, coordinated
version pins, and required checks. Update consumer instructions when their
contracts change. If the selected response changes an accepted architectural
decision, record the new decision and mark the earlier record superseded.
Review the complete generated semantic diff rather than treating successful
compilation as compatibility evidence.

Verify the chosen behavior and relevant failure paths. Separate static/local
evidence from hosted execution and account-specific model access. Use the user's
agreed acceptance boundary; do not add consumer hosted-use acceptance when it
was explicitly excluded.

When rollout is authorized, derive its order from the permission and compatibility
analysis. A new callee permission requires sufficient caller grants before the
shared change becomes effective. Observe each affected repository and revision
after an action, then confirm the intended grant or check before advancing to a
dependent rollout step. Re-observe after interruption. Reconcile partial,
contradictory, or unknown results, or stop and report them. Required-check
migration follows the effective workflow contract in the consumer guide.

## 5. Hand off at the agreed boundary

For an assessment, deliver the old/new explanation, blocker findings, model
findings when requested, impact, recommendation, and unresolved decisions.
For implementation, also report changed revisions, validation and its limits,
rollout state, and remaining work. Close historical blockers only with the
agreed evidence. Stop at the user's publication or human approval boundary;
local checks and a passing review gate do not authorize a merge.
