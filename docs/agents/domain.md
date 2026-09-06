# Domain documents

This repository uses one domain context. Its optional domain documents use
this layout:

    CONTEXT.md
    docs/adr/

Before exploring, designing, or implementing a change, read the root glossary
and any architectural decision records relevant to that change. If these
documents do not exist yet, proceed silently.

Use the glossary's canonical terms in issues, specifications, code, tests, and
documentation. Use the domain-modeling Skill when a required concept is missing
or existing terms conflict.

An architectural decision record owns the rationale, alternatives, and
consequences of a consequential decision. Surface a conflict with an accepted
record before proceeding; do not silently override it. Current implementation
and operational documentation own current behavior.

Create or extend the glossary and decision records when domain modeling resolves
actual terms or decisions. Do not create placeholder records during setup.
