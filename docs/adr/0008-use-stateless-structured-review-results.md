# Use stateless structured review results

This supersedes [ADR 0005](0005-recover-with-full-review-attempts.md) and the
review-result authentication aspects of
[ADR 0001](0001-own-the-review-pipeline-in-a-reusable-workflow.md) and
[ADR 0007](0007-retain-the-existing-agent-isolation-model.md). Coupling verdicts
to Markdown made a published review unusable when its list formatting changed.
Structured results separate the machine decision from readable review content.

Each workflow run is independent. Its structured verdict travels through a
custom safe output and a run-local artifact, not review Markdown. GitHub's
failed-job rerun can reuse successful stages and their artifacts. The verdict
artifact is retained for 30 days; framework artifacts keep their own defaults.
There is no requirement that every stage ran in the latest attempt, and no
cross-run reconciliation or current-PR-state check at publication or the gate.

This deliberately favors simple recovery over publication deduplication. A
rerun may publish another review; the workflow neither searches for nor removes
earlier comments. Missing or expired artifacts require a full rerun, while a new
review subject requires a new PR event. The gate still requires successful
prerequisites and one complete structured result.
