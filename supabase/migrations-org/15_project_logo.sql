-- Logo do projeto (portal do cliente e cabeçalho do projeto)
alter table public.projects add column if not exists logo_url text;
