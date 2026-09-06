# Kestrel

Repository-aware AI reviews, delivered through reusable GitHub workflows.

Kestrel owns trusted setup, sandboxed Copilot execution, comment publication,
and an authenticated review gate. Consumers supply configuration and optional
review criteria, without installing or maintaining the implementation.

- [Set up a consumer repository](docs/consumer-setup.md)
- [Develop and operate Kestrel](CONTRIBUTING.md)
- [Domain language](CONTEXT.md) and [architectural decisions](docs/adr/)

Consumers follow `main`; review Skills and Knowledge follow latest upstream.
There is no separate release process. High/medium findings fail the gate; an
otherwise completed, authenticated review passes. This is a comment review,
not a human approval or permission to merge.

Candidate scripts run in separate CI. The reviewer is instructed not to execute
PR-provided code. Its sandbox retains broad tools; this instruction is not a
mechanical command allowlist.

Licensed under [MIT](LICENSE). The parser, gate, GitHub adapter, compiler helpers,
and applicable tests were extracted from
[Soulike/knowledge-base](https://github.com/Soulike/knowledge-base).
