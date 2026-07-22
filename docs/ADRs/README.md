# Architecture Decision Records

One file per real decision, numbered `NNN-short-title.md`. Write an ADR when a
choice is expensive to reverse (DB strategy, auth model, queue system).

Don't pre-write ADRs for decisions you haven't made yet — an invented ADR is
worse than none. Add them as the decisions actually happen.

## Template

```md
# NNN. <Title>

- Status: proposed | accepted | superseded by NNN
- Date: YYYY-MM-DD

## Context
What forces are at play, what problem we're solving.

## Decision
What we chose.

## Consequences
Trade-offs, what this makes easy, what it makes hard.
```
