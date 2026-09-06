# Issue tracker: GitHub

Engineering specs and tickets live in GitHub Issues. Establish the target
repository from `origin` and use the authenticated `gh` CLI with that
repository explicitly selected for issue operations.

Read an issue's complete body, comments, labels, and blocking relationships
before treating it as an implementation input.

GitHub shares one number space between issues and pull requests. Establish
which object a number identifies before mutating it.

When a Skill says to publish to the issue tracker, create a GitHub issue.
When it says to fetch a ticket, retrieve the complete issue and its discussion.

For blocking edges between implementation tickets, use GitHub's native issue
dependencies. If that operation is unavailable, record the blockers explicitly
in a `Blocked by` section of the dependent issue.

## Pull requests as a triage surface

PRs as a request surface: no.

Use issues for incoming requests and specifications; use pull requests to
review proposed implementation changes.
