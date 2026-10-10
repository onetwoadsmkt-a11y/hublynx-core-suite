# Architecture rules

- Project detail sections use the shared Tabs controls, keeping the project header and alerts visible outside the panels to preserve context.
- Project evolution reads relational stages through the existing authenticated stage function and shared project-stages query key, so roadmap updates refresh the same progress data without introducing new storage or mutation logic.