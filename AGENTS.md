# Architecture rules

- Project detail sections use the shared Tabs controls, keeping the project header and alerts visible outside the panels to preserve context.
- Project evolution reads relational stages through the existing authenticated stage function and shared project-stages query key, so roadmap updates refresh the same progress data without introducing new storage or mutation logic.
- New accounts are provisioned into existing organization tables with explicit membership and module permissions; public signup remains pending to avoid implicit paid access.
- Workspace access and branding are scoped to the authenticated identity; access queries fail closed instead of turning errors into empty memberships.