# Architecture rules

- Project detail sections use the shared Tabs controls, keeping the project header and alerts visible outside the panels to preserve context.
- Project evolution reads relational stages through the existing authenticated stage function and shared project-stages query key, so roadmap updates refresh the same progress data without introducing new storage or mutation logic.
- Public signup trials are provisioned atomically by a database auth trigger into existing organization tables; server-generated expiry and restrictive data policies prevent client-side trial extensions and cross-tenant access.
- Workspace access and branding are scoped to the authenticated identity; access queries fail closed instead of turning errors into empty memberships.
- Server-function requests use framework CSRF middleware while preserving bearer authentication to reject cross-site mutations.