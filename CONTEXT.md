# AI Review Workflow

The reusable workflow provides repository-aware AI reviews for consumer
repositories.

## Language

**Consumer repository**: A repository that uses the shared workflow to review
its pull requests, including the workflow repository when it reviews itself.

**Repository review prompt**: The consumer repository's review criteria,
distinct from the shared review criteria and execution, safety, publication, and
verdict rules.

**Review verdict**: The assessment of a change after a completed review,
distinct from execution status and a human's approval or merge decision. A
review that was not completed has no review verdict.

**Review gate**: The required check that reads a completed workflow run's review result and
reports whether it satisfies the review requirement.
