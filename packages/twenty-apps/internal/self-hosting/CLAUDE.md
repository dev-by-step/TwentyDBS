## Base documentation

- Documentation: https://docs.twenty.com/developers/extend/apps/getting-started
- Rich app example: https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/examples/postcard

## UUID requirement

- All generated UUIDs must be valid UUID v4.

## Common Pitfalls

- Creating an object without an index view associated. Unless this is a technical object, user will need to visualize it.
- Creating a view without a navigationMenuItem associated. This will make the view available on the left sidebar.
- Creating a front-end component that has a scroll instead of being responsive to its fixed widget height and width, unless it is specifically meant to be used in a canvas tab.

## Review Guardrails

- Do not hardcode business values, labels, or configuration when the value can live in settings, constants, env vars, or an existing service.
- In tests, prefer shared factories and full entities over ad hoc IDs or inline faker-generated payload fragments.
- If the same error message, enum value, or literal appears more than once, extract it from the implementation instead of duplicating it locally.
- Extract non-trivial conditions into named variables before branching so the intent is obvious during review.
- Prefer established helpers and libraries for serialization and parsing work instead of manual string concatenation.
- For SQL, keep identifiers escaped at build time and pass runtime data through placeholders and bound values.
- For i18n explicit ids, use stable English-only identifiers without spaces or special characters.
