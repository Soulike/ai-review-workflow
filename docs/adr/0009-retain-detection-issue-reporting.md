# Retain gh-aw detection issue reporting

This partially supersedes the exclusion of automatic operational issue reporting
in [ADR 0001](0001-own-the-review-pipeline-in-a-reusable-workflow.md).

Retain gh-aw's default detection issue reporting so threat findings, detector
failures, and invalid detection results have a centralized tracking location in
each consumer repository. The v1.2.2 compiler accounts for this reporting path
when deriving the `conclusion` job's `issues: write` permission; adapt the caller
permission ceilings to that behavior rather than disabling reporting to fit the
previous settings. The Agent retains read-only issue access, and other
issue-reporting settings remain unchanged.

This reporting is best effort and does not replace detection enforcement or the
review gate. The [consumer guide](../consumer-setup.md) owns the required grants,
reporting behavior, and permission-first rollout sequence.
