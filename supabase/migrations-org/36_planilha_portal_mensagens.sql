-- 36 — Planilhas do Comercial no portal do cliente + conversa no rodapé da planilha (03/11/2026)
-- • "Liberar para o cliente": a planilha aparece no portal, só para ver.
-- • Rodapé da planilha: mensagens entre o cliente e a equipe. O cliente responde a toda a equipe
--   ou direciona para uma pessoa; a equipe escreve para o cliente. Avisos no sino + e-mail.
-- Pode rodar mais de uma vez.

alter table public.cost_sheets
  add column if not exists portal_visible boolean not null default false;

create table if not exists public.cost_sheet_messages (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.cost_sheets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_kind text not null default 'equipe' check (author_kind in ('equipe', 'cliente')),
  recipient_id uuid references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists cost_sheet_messages_sheet_idx on public.cost_sheet_messages (sheet_id, created_at);

alter table public.cost_sheet_messages enable row level security;
-- equipe do projeto lê e escreve (o cliente usa as funções do portal, pelo servidor)
drop policy if exists "sheet messages team read" on public.cost_sheet_messages;
create policy "sheet messages team read" on public.cost_sheet_messages for select to authenticated
  using (public.can_view_project(project_id) and not public.is_client_of(project_id, auth.uid()));
drop policy if exists "sheet messages team write" on public.cost_sheet_messages;
create policy "sheet messages team write" on public.cost_sheet_messages for insert to authenticated
  with check (
    public.can_view_project(project_id) and not public.is_client_of(project_id, auth.uid())
    and author_id = auth.uid() and author_kind = 'equipe'
    and project_id = (select d.project_id from public.cost_sheets s
                        join public.cost_departments d on d.id = s.department_id where s.id = sheet_id)
  );
drop policy if exists "sheet messages own delete" on public.cost_sheet_messages;
create policy "sheet messages own delete" on public.cost_sheet_messages for delete to authenticated
  using (author_id = auth.uid());
grant select, insert, delete on public.cost_sheet_messages to authenticated;

-- Avisos (sino + e-mail)
create or replace function public.tg_sheet_message_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_proj text; org uuid; slug text; v_sheet text; v_who text; v_txt text; v_body text; uid uuid;
  v_team_link text; v_portal_link text;
begin
  select name, organization_id, coalesce(portal_slug, id::text) into v_proj, org, slug
    from public.projects where id = new.project_id;
  select name into v_sheet from public.cost_sheets where id = new.sheet_id;
  v_who := public.actor_name(new.author_id, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end);
  v_txt := left(public.plain_text(new.body), 400);
  v_body := v_proj || ' · planilha ' || coalesce(v_sheet, '') || ' — ' || v_who || ': ' || v_txt;
  v_team_link := '/projetos/' || new.project_id::text || '?aba=comercial&planilha=' || new.sheet_id::text;
  v_portal_link := '/portal/' || slug || '?planilha=' || new.sheet_id::text;

  if new.author_kind = 'cliente' then
    if new.recipient_id is not null then
      insert into public.notifications (user_id, title, body, link)
      values (new.recipient_id, 'Mensagem do cliente para você', left(v_body, 280), v_team_link);
      insert into public.project_mail_queue
        (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
      values (org, new.project_id, new.recipient_id, 'equipe', 'sheet_message', true,
              'Mensagem do cliente para você', left(v_body, 1000), v_team_link, new.author_id);
    else
      perform public.project_notify(new.project_id, null, 'equipe', 'sheet_message', true,
        'Mensagem do cliente na planilha', v_body, v_team_link, new.author_id);
    end if;
  else
    for uid in select * from public.project_clients(new.project_id) loop
      continue when uid = new.author_id;
      insert into public.notifications (user_id, title, body, link)
      values (uid, 'Nova mensagem na planilha', left(v_body, 280), v_portal_link);
      insert into public.project_mail_queue
        (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
      values (org, new.project_id, uid, 'cliente', 'sheet_message', true,
              'Nova mensagem na planilha', left(v_body, 1000), v_portal_link, new.author_id);
    end loop;
  end if;
  return new;
exception when others then
  return new; -- o aviso nunca impede gravar a mensagem
end $$;
revoke execute on function public.tg_sheet_message_notify() from public, anon, authenticated;
drop trigger if exists tg_sheet_message_notify on public.cost_sheet_messages;
create trigger tg_sheet_message_notify after insert on public.cost_sheet_messages
  for each row execute function public.tg_sheet_message_notify();

-- tempo real (conversa atualiza sozinha na tela da equipe)
do $$ begin
  alter publication supabase_realtime add table public.cost_sheet_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

select count(*) as planilhas_liberadas from public.cost_sheets where portal_visible;
