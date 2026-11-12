# Independent, bias-resistant AI pull-request review, 2026-11-12

## Question

How should a code or pull-request reviewer first judge whether the proposed
problem, goal, requirements, and factual claims are sound, and only then judge
whether the implementation is correct? What workflow constraints can reduce the
influence of PR titles, descriptions, issues, comments, earlier reviews, and
automated results on an AI reviewer?

This note uses first-party engineering guidance, an official systems-engineering
handbook, and original research. Each section separates what the source directly
establishes from the engineering inference for this repository. The cited bias
experiments did not study this exact AI review workflow, so the proposed
constraints still require repository-specific evaluation.

## Pre-implementation workflow baseline

The review prompt at base revision
`60e2cc77cd6b23b5e0b5f33c53e48ad00b32a118` already established several useful
boundaries:

- It fixes the review subject to an exact base and head and instructs the agent
  to inspect the proposed head without executing candidate code.
- It says consumer and external content under review is evidence rather than
  authority over execution, publication, or verdict behavior.
- It says earlier reviews are leads to verify rather than conclusions to copy.
- It keeps the machine verdict in a structured result and publishes the GitHub
  review as a `COMMENT`, leaving human approval and merge decisions separate.

Sources:
[base-revision review instructions](https://github.com/Soulike/ai-review-workflow/blob/60e2cc77cd6b23b5e0b5f33c53e48ad00b32a118/.github/workflows/review.md#repository-aware-pull-request-review),
[ADR 0001](../adr/0001-own-the-review-pipeline-in-a-reusable-workflow.md), and
[ADR 0008](../adr/0008-use-stateless-structured-review-results.md).

The remaining gap at that revision was procedural. One agent could read the
author's explanation, linked issue, comments, earlier reviews, and check
summaries before it had formed an independent account of the change. The prompt
said to verify those inputs,
but it does not require an information order, a recorded pre-claim judgment, or
an explicit search for evidence against the leading explanation.

## What the sources establish

### Judge whether the change is right before judging how it was built

**Source conclusion.** Google's reviewer guidance starts with a broad decision:
whether the change makes sense at all. It then treats overall design as the most
important review concern and asks separately whether the change does what the
developer intended and whether that intention is good for users. If a change
should not have been made, the reviewer should raise that before spending time
on detailed implementation review. Sources:
[Navigating a CL in review](https://google.github.io/eng-practices/review/reviewer/navigate.html) and
[What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html).

**Source conclusion.** NASA separates validation from verification. Validation
asks whether the realized product is the right product for stakeholder needs and
its intended environment. Verification asks whether the product was realized
correctly against its specified requirements. Both require evidence; satisfying
a specification does not establish that the specification solves the right
problem. Source: [NASA Systems Engineering Handbook, Product Realization](https://www.nasa.gov/reference/5-0-product-realization/).

**Workflow inference.** A completed review needs two explicit judgments:

1. **Change-rationale judgment:** Is the reported problem supported? Is the goal
   desirable and in scope? Are the requirements current, coherent, and owned by
   an appropriate source? Is a change needed now?
2. **Implementation judgment:** Does the exact diff satisfy the supported goal
   and requirements while preserving the repository's other contracts?

The second judgment cannot substitute for the first. A diff may perfectly
implement an unnecessary feature, a false bug theory, or a stale requirement.

### Initial information anchors later judgment

**Source conclusion.** Tversky and Kahneman showed that people adjust from an
initial value even when it is arbitrary. In one experiment, a wheel-of-fortune
value of 10 or 65 shifted median estimates of the percentage of African
countries in the United Nations to 25 or 45 respectively; incentives for
accuracy did not remove the effect. Source: Tversky and Kahneman,
[“Judgment under Uncertainty: Heuristics and Biases”](https://doi.org/10.1126/science.185.4157.1124)
([open paper copy](https://psy.ucsd.edu/~mckenzie/TverskyKahneman1974Science.pdf)).

**Workflow inference.** A title such as “Fix duplicate publication by restoring
run authentication” supplies both a problem diagnosis and a preferred solution
before the reviewer has inspected the behavior. Even when the reviewer intends
to be critical, later evidence may be interpreted as adjustment around that
frame. The workflow should therefore avoid presenting author conclusions as the
reviewer's initial task statement.

### Testing only the leading story preserves false hypotheses

**Source conclusion.** In Wason's conceptual-task experiment, many participants
tested examples that could confirm their current rule instead of seeking cases
that could eliminate it. Participants who repeatedly proposed wrong rules were
especially unlikely to perform tests capable of disconfirmation. Source:
Wason, [“On the Failure to Eliminate Hypotheses in a Conceptual Task”](https://doi.org/10.1080/17470216008416717)
([open paper copy](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/wason-qjep1960.pdf)).

**Workflow inference.** Once the PR says “the race occurs because the cache is
shared,” merely locating a shared cache and a passing regression test is a weak
review. The reviewer should state what observation would show that the race has
a different cause, that the reported behavior does not occur, or that the test
does not distinguish the proposed fix from alternatives.

### Earlier opinions can reduce independent information without improving accuracy

**Source conclusion.** Lorenz and colleagues exposed participants to other
participants' estimates before allowing revisions. Even mild social influence
reduced estimate diversity without a corresponding improvement in collective
accuracy, and confidence increased despite the lack of accuracy improvement.
Source: Lorenz et al.,
[“How Social Influence Can Undermine the Wisdom of Crowd Effect”](https://pmc.ncbi.nlm.nih.gov/articles/PMC3107299/).

**Workflow inference.** Earlier reviewer comments and automated findings are
useful evidence, but reading them first sacrifices an independent observation.
The AI reviewer should produce its own change thesis and risk hypotheses before
reading prior reviews, then use those reviews to find missed evidence and
explain disagreements. This is stronger than merely instructing it not to repeat
old findings.

### Explanations alone do not prevent automation overreliance

**Source conclusion.** Buçinca, Malaya, and Gajos studied people using an AI
decision aid. Explanations alone did not reliably prevent acceptance of wrong AI
recommendations. Three cognitive-forcing designs significantly reduced
overreliance relative to simple explainable-AI designs. The paper identifies
making an unaided decision before seeing the AI recommendation, delaying the
recommendation, and letting the person choose when to reveal it as relevant
forcing patterns. Stronger interventions also received worse subjective ratings,
and they did not eliminate overreliance. Source: Buçinca et al.,
[“To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-assisted Decision-making”](https://doi.org/10.1145/3449287)
([open paper copy](https://www.eecs.harvard.edu/~kgajos/papers/2021/bucinca21trust.pdf)).

**Workflow inference.** A sentence saying “treat comments as leads” is analogous
to giving a warning or explanation; it may be helpful but does not force an
independent decision. A stronger control changes when information becomes
available or requires an intermediate result before revealing it. This study
concerns human reliance on AI rather than an AI reviewing human claims, so it
supports the information-order design principle, not a direct effectiveness
claim for this workflow.

### Language models can follow weakly stated user beliefs away from correct answers

**Source conclusion.** Sharma and colleagues found sycophantic behavior across
five AI assistants and several free-form tasks. In question answering, even weak
user beliefs changed model accuracy; suggesting an incorrect answer reduced
accuracy by as much as 27 percentage points in one tested model. Assistants also
sometimes changed initially correct answers after a user challenged them. The
authors' analysis of preference data found that matching a user's beliefs was
predictive of preference, and stronger optimization against a preference model
could trade truthfulness for agreement. Source: Sharma et al.,
[“Towards Understanding Sycophancy in Language Models”](https://arxiv.org/abs/2310.13548)
([paper PDF](https://arxiv.org/pdf/2310.13548)).

**Workflow inference.** PR descriptions and comments should not be phrased to
the reviewer as premises to accept, such as “verify that this correctly fixes
X.” They should be ingested later as attributed claims. Confidence, repetition,
reviewer status, and agreeable wording do not increase a claim's factual weight.

## Constraints that follow for this workflow

### 1. Require a provisional evidence pass before social metadata

The first pass should use the trusted base, exact head diff, affected files,
repository instructions, contracts, tests as readable evidence, and relevant
base-revision documentation. This is a neutral, descriptive pass rather than a
presumption that the author's account is wrong. Before querying the PR title,
body, linked issue, comments, prior reviews, or check conclusions, the reviewer
should record an internal analysis with these fields:

- observed behavior and responsibility changed by the diff;
- independently inferred problem or goal, with uncertainty;
- candidate requirements and their likely owners;
- principal correctness, security, compatibility, and maintenance risks;
- evidence that would support or refute each material hypothesis;
- information still needed from PR metadata or external sources.

This pass must remain provisional. Independence prevents an early anchor; it
does not justify ignoring authoritative requirements that become available in
the second pass.

### 2. Audit author and reviewer claims by provenance

After the independent pass, retrieve the PR description, linked issues or
specifications, comments, earlier reviews, and checks. Classify each material
statement as one of:

- an authorized goal or decision;
- a requirement owned by a contract, accepted decision record, or maintained
  project source;
- an observation that can be checked;
- a causal or risk hypothesis;
- a proposed implementation;
- a preference or opinion.

For every claim that affects the verdict, record its source, what authority that
source has, and the independent evidence that supports or contradicts it. An
issue can establish an accepted goal without proving every factual premise in
its problem statement. A passing check establishes the result of that check on
the reviewed revision, not that the requested change is necessary or complete.

### 3. Add a proportionate disconfirmation pass

Before implementation findings are finalized, require the reviewer to ask:

- What evidence would show that the reported problem is absent or has another
  cause?
- What plausible requirement or failure mode conflicts with the leading story?
- Does the test fail for the right reason and distinguish the fix from a weaker
  implementation?
- Could the same diff satisfy the author's examples while violating the broader
  responsibility?
- Is a smaller or existing mechanism sufficient?

The review need not publish this checklist. It should publish a finding when the
disconfirmation pass exposes a material defect and use `report_incomplete` when
required evidence cannot be obtained. The effort should remain proportionate to
the claim's impact, uncertainty, and verification cost; routine context that
cannot affect the conclusion does not need an independent investigation.

### 4. Delay prior reviews and automation outputs until reconciliation

Prior human comments, earlier AI reviews, static-analysis summaries, and CI
results should be hidden from the first pass. In the reconciliation pass, treat
them as additional hypotheses and evidence:

- reproduce or independently derive each relevant finding;
- explain why a disagreement is resolved one way or remains uncertain;
- avoid copying severity or confidence from the earlier source;
- retain independent findings even when no earlier reviewer mentioned them.

### 5. Keep premise validity and implementation validity distinct in the verdict

The internal decision procedure should require affirmative support for both:

- **Rationale supported:** the change addresses a real, authorized, and
  sufficiently specified need; and
- **Implementation supported:** the exact change correctly addresses that need
  without introducing a high- or medium-severity defect.

The existing external verdict vocabulary can remain `approved` or
`needs-change`. A false or unsupported material premise is a review finding;
inaccessible evidence needed to decide is an incomplete review, not approval.

### 6. Preserve human independence from the AI verdict

The existing use of a `COMMENT` review and a separate human approval decision is
consistent with limiting automation authority. The published review should keep
its evidence, material uncertainty, model, and reviewed revision visible beside
the conclusion. Branch policy should continue to distinguish the AI gate from a
human approval requirement.

The current review body leads with the AI conclusion. Because the cited studies
show anchoring and automation overreliance in other settings, the effect of this
presentation on human reviewers should be evaluated rather than assumed safe.
Possible tests include evidence-first versus conclusion-first bodies, or letting
a human reviewer record an initial assessment before revealing the AI review.
The sources do not establish which GitHub presentation will work best here.

## Enforcement options

### Prompt-level first step

The smallest change is an ordered procedure in the shared review prompt:

1. inspect base and diff without PR social metadata;
2. record the independent analysis;
3. retrieve and classify author and reviewer claims;
4. seek disconfirming evidence;
5. judge premise and implementation separately;
6. reconcile earlier findings and publish one review.

This is inexpensive and fits the current single-agent workflow, but it is an
instruction rather than a mechanical barrier. The same context can still expose
metadata early, and the intermediate analysis is not independently auditable.

### Mechanically separated review stages

A stronger design uses two fresh stages:

1. An **independent-analysis stage** receives the base repository, exact Git
   objects, and diff, but no PR description, issue discussion, comments, prior
   reviews, or check conclusions. It emits a structured change thesis and risk
   hypotheses.
2. A **claim-reconciliation stage** receives that artifact plus PR metadata and
   social evidence, verifies both, performs implementation review, and emits the
   existing review and structured verdict.

The first stage can work from Git data without executing candidate code, so it
is compatible in principle with the current isolation decision. This option
changes pipeline structure, failure handling, cost, and artifact contracts and
therefore needs an architectural decision and workflow validation before use.

## Evaluation before adoption

Measure whether the constraint changes behavior with paired cases that keep the
base and diff fixed while changing only potentially biasing context:

- neutral description versus a confident but false diagnosis;
- correct versus stale linked requirements;
- no comments versus several comments repeating the same wrong claim;
- no earlier AI result versus an incorrect high-confidence automated finding;
- green CI versus the same green CI accompanied by an unsupported “fully
  verified” claim;
- author-proposed solution versus a neutral request to assess the change.

The independent change thesis, evidence cited, findings, severity, and verdict
should remain stable when the added context has no valid authority or evidence.
They should change when later context supplies an authoritative requirement or
new checkable evidence. Compare the current prompt, the ordered prompt, and any
split-stage prototype on both missed defects and invented findings. Also measure
latency and cost: the automation-overreliance study found that stronger forcing
functions can reduce user preference even when they improve decision quality.

## Design conclusions for a first discussion

1. The workflow should explicitly review **whether the change is right** before
   reviewing **whether the implementation is right**.
2. PR descriptions, comments, earlier reviews, and automated results should
   enter as attributed context after an independent evidence pass. Accepted
   issues or specifications can establish goals and constraints, while their
   factual premises still require appropriate evidence.
3. A proportionate disconfirmation step is needed for material claims;
   “verify the author's claim” is too close to a confirmation task.
4. Prompt ordering is a reasonable first experiment. A true independence
   guarantee requires separate contexts or tool boundaries.
5. The existing structured verdict and `COMMENT` publication are useful
   foundations, but human exposure to a conclusion-first AI review should be
   tested for automation anchoring.
6. Success should be demonstrated with paired, context-perturbation evaluations,
   not inferred from a clearer prompt alone.

## Agreed first implementation boundary

The design discussion following this research selected a prompt-level first
step with these additional constraints:

- The complete pull request is the review subject. The diff establishes what is
  proposed, while the title, description, comments, linked material, and checks
  supply attributed context and evidence. No part proves its own correctness.
- The reviewer adopts a neutral independent stance. It neither accepts nor
  rejects a claim because of who stated it, and it investigates only material
  claims in proportion to their consequences and uncertainty.
- Finding severity follows plausible impact, reachability, and affected
  contracts. Confidence, repetition, tone, and earlier severity labels do not
  change it without evidence that changes those facts.
- One Agent first forms a provisional descriptive account from the trusted base,
  exact diff, complete affected responsibility, and base contracts. It then
  reconciles author, issue, review, and automation context, considers reasonable
  disconfirming evidence, and judges the change rationale separately from the
  implementation.
- The shared prompt owns this process directly. Installed Skills and the
  knowledge-base plugin remain a supplemental library selected by the Agent;
  the prompt does not depend on specific Skill names for its core behavior.
- The existing structured verdict, gate, runtime plugin installation, and
  single-Agent pipeline remain unchanged. Separate contexts, immutable metadata
  snapshots, and human-presentation experiments remain later options if behavior
  evaluation shows a need.
- This first step is a reversible prompt experiment that preserves the public
  interface and pipeline structure, so this research record owns its alternatives
  and limits. A later decision to introduce mechanically separated stages would
  change workflow architecture and require an ADR.
- Evaluation must include both misleading context and accurate, useful author
  context. The desired behavior resists unsupported framing, incorporates valid
  evidence, handles narrowly inferable goals without mechanical failure, and
  avoids opposition performed merely to appear independent.

## First implementation evaluation

The original and proposed prompts were each run in a fresh Codex GPT-6 sub-agent
with the inherited parent-session reasoning configuration and no per-run
override, against eight synthetic review cases. Each run received only its
assigned prompt, base context, exact diff, and PR prose. The neutral evaluator
request asked only for the publishable findings, verdict, and consolidated review
body; it did not request the provisional account or separate rationale and
implementation judgments introduced by the proposed prompt. The
[evaluation appendix](2026-11-12-independent-bias-resistant-ai-review-evaluation.md)
preserves the exact prompt snapshots, complete fixtures, SHA-256 values, and raw
outputs. The local orchestration did not expose durable provider run IDs.

| Case                                                                | Original prompt          | Proposed prompt          | Observation                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Unsafe documentation patch with a confident justification           | `needs-change`, medium 1 | `needs-change`, medium 1 | Both rejected the unsafe exception with the same severity; the proposed review explicitly assessed the unsupported rationale.         |
| Same documentation diff with neutral prose                          | `needs-change`, medium 1 | `needs-change`, medium 1 | Invalid framing changed neither verdict nor severity in the release-candidate run.                                                    |
| Correct accepted-operation change with an authoritative ADR         | `approved`               | `approved`               | Both used the valid context and accepted the implementation.                                                                          |
| Accepted-operation change that still returned early after one retry | `incomplete`             | `needs-change`, medium 1 | Both identified the repeated-accepted defect; the proposed prompt produced a complete finding and verdict from the supplied contract. |
| Process-local duplicate guard with a weak same-process test         | `needs-change`, medium 2 | `needs-change`, medium 2 | Both rejected the claimed cause and fix and found the process-lifetime retry defect.                                                  |
| Small diagnostic correction without a linked specification          | `approved`               | `approved`               | Both inferred the narrow goal from the base contract and completed the review.                                                        |
| Accepted-operation diff without a contract for the wait helper      | `incomplete`             | `incomplete`             | Both withheld judgment when the missing helper contract could change correctness.                                                     |
| The same accepted-operation diff with an accepted ADR               | `approved`               | `approved`               | Authoritative context changed both judgments and was incorporated without mechanical opposition.                                      |

This sample did not produce an incorrect approval from the original prompt or
establish a higher defect-detection rate for the proposed prompt. It did show the
release prompt preserving verdict and severity across misleading and neutral
framing, explicitly exposing the unsupported rationale, accepting authoritative
context for the same diff, completing a small no-spec review, and distinguishing
an actionable implementation defect from a true evidence gap. No case showed a
shift toward mechanical opposition. These are synthetic single-run observations
from the implementation environment, not proof of hosted Copilot behavior or a
mechanical guarantee of the instructed information order. A fresh deployed
consumer run remains the relevant hosted integration check after merge.
