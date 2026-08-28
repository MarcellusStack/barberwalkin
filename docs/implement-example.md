Implement GitHub issue #2 end to end. Fetch the full issue and comments, read the parent spec #1 plus the repository glossary and ADRs, and work only within this ticket’s scope. Run every acceptance check and relevant lint, type-check, build, and browser tests. Report evidence for each acceptance criterion. Do not close the issue until the implementation is integrated and all checks pass.

Find the next open [Txx] issue labeled ready-for-agent with zero open blockers. Implement only that issue end to end, verify every acceptance criterion, and report the result.

/implement issue #6 end-to-end.
- Fetch: `gh issue view 6 --comments` (Spec: #1 / docs/blueprint.md)
- Reference: https://better-auth.com/docs/integrations/convex
- Scope: Implement only #6 criteria.
- Verify: Run lint, typecheck, and test:browser. Report evidence before closing.