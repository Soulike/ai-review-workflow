# Test candidate code in separate CI

Kestrel uses its own pnpm-managed `package.json` and committed lockfile, with
package scripts as the shared entrypoints for local validation and CI. A
separate pull-request CI workflow runs those scripts against candidate code
with read-only permissions and no review credentials. Keeping this workflow
separate allows candidate code to be tested without executing it inside the
privileged AI-review workflow.

## Consequences

The package scripts cover deterministic script, adapter, and executable-entrypoint
tests using Node's built-in test runner, alongside TypeScript typechecking,
ESLint code linting, Prettier formatting, actual workflow compilation, and
generated-artifact validation.
The CI workflow invokes these scripts rather than duplicating their commands;
maintainer documentation explains the same local entrypoints.

ESLint and Prettier have separate responsibilities without overlapping
formatting rules. CI uses non-mutating check commands; explicit fix and format
commands are available for local development. Compiler-owned generated
workflows retain compiler formatting and are validated through compilation and
drift checks rather than being reformatted by Prettier.

Local validation does not establish GitHub's live permission, nested-context,
check-presentation, or publication behavior. Kestrel's self-consumer verifies
the deployed `main` workflow; it does not establish live cross-repository
integration. Distinct-repository fixtures protect the owned portability
behavior, while any claim of live integration with another consumer requires
its own evidence. This does not introduce a release process or a dedicated
validation repository, and consumers do not install Kestrel's development
dependencies.
