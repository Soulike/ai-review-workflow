# Own the review pipeline in a reusable workflow

The review pipeline is distributed through a reusable GitHub workflow plus
consumer configuration, rather than copied implementation scripts or an
installation Skill. The reusable workflow owns setup, review execution, safe
publication, and verdict authentication; consumer repositories supply settings,
credentials, and repository-specific review criteria. This keeps consumers from
having to compile the workflow, install its implementation dependencies, or
maintain their own review gate.

## Consequences

Caller-facing results are the authenticated required check and the consolidated
pull-request review with inline comments. A declared workflow result output and
automatic operational issue reporting are outside the consumer interface.

Consumer integration must include a setup guide covering the caller workflow,
inputs, permissions, credentials, repository review prompt, and required-check
configuration. The guide must also explain how to verify the first review and
recover from failure without requiring consumers to understand the shared
implementation.
