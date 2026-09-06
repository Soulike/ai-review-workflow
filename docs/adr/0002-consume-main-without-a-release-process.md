# Consume main without a release process

Kestrel currently has one user, so consumer repositories, including Kestrel
itself, select the reusable workflow from `main` rather than a pinned release.
There is no separate release process; ordinary changes to `main` become
available to consumers without a version-update PR. This reduces maintenance
overhead while accepting that a faulty change on `main` can affect every
consumer before it is corrected.
