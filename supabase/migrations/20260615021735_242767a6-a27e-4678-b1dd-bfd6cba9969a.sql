ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS roadmap_stages jsonb NOT NULL DEFAULT '[
  {"name":"Briefing","done":false},
  {"name":"Planejamento","done":false},
  {"name":"Produção","done":false},
  {"name":"Aprovação","done":false},
  {"name":"Entrega","done":false}
]'::jsonb;