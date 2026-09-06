# Recover with full review attempts

Status: Superseded by [ADR 0008](0008-use-stateless-structured-review-results.md).
The original recovery decision is recorded below.

Recovery from a failed review reruns the whole workflow, rather than supporting
individual-stage resumption or an automatic recovery system. Each attempt must
produce its own authenticated complete result; earlier comments may remain
visible, but an earlier attempt's result cannot satisfy the new attempt's review
gate. This keeps recovery simple without adding a contract for reusing partial
inference or publication state.
