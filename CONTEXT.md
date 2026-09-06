# Kestrel

Kestrel provides repository-aware AI reviews for consumer repositories.

## Language

**Consumer repository**:
A repository that uses Kestrel to review its pull requests, including Kestrel's
own repository when it reviews itself.

**Repository review prompt**:
The consumer repository's review criteria, distinct from Kestrel's shared
review criteria and execution, safety, publication, and verdict rules.

**Review verdict**:
Kestrel's assessment of a change after a completed review, distinct from
execution status and a human's approval or merge decision. A review that was
not completed has no review verdict.

**Review gate**:
The required check through which Kestrel authenticates a review result and
reports whether it satisfies the review requirement.
