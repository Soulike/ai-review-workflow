# Recover failed jobs from run artifacts

Each workflow run is independent. Its structured verdict travels through a
custom safe output and a run-local artifact, not review Markdown. GitHub's
failed-job rerun can reuse successful stages and their artifacts. The verdict
artifact is retained for 30 days; framework artifacts keep their own defaults. There is no requirement that every stage ran in the latest
attempt, and no cross-run reconciliation or current-PR-state check at publication
or the gate.

This deliberately favors simple recovery over publication deduplication. A
rerun may publish another review; the workflow neither searches for nor removes
earlier comments. Missing or expired artifacts require a full rerun, while a new
review subject requires a new PR event. The gate still requires successful
prerequisites and one complete structured result.
