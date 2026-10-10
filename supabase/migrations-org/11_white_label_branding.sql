-- 11_white_label_branding.sql
-- White label por empresa (aplicado direto no Supabase em 10/10/2026, registrado aqui).
-- Cada empresa altera apenas a própria logo e cor; nenhuma empresa acessa outra.

-- 1) Cor da marca
alter table public.organizations
  add column if not exists brand_color text
  check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.organizations.brand_color is
  'Cor principal da marca (hex #RRGGBB). Substitui o verde da Core Suite nos destaques. Null = padrão Core.';

-- 2) Bucket público das logos (1 MB, só imagens)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', true, 1048576,
        array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- 3) Só o admin da empresa grava na pasta <organization_id>/ da própria empresa
create policy "org branding write" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-branding'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('png','jpg','jpeg','svg','webp'));

create policy "org branding update" on storage.objects for update to authenticated
  using (bucket_id = 'org-branding' and public.is_org_admin(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'org-branding' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

create policy "org branding delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-branding' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

-- 4) Trava: admin da empresa não altera plano/status/identificação,
--    e a logo só pode apontar para a pasta da própria empresa.
create or replace function public.guard_organizations_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text := 'https://gyxzrnoxzaraossrqyuc.supabase.co/storage/v1/object/public/org-branding/';
begin
  if public.is_super_admin() or auth.uid() is null then
    return new; -- super admin da plataforma e rotinas do servidor
  end if;
  if new.id is distinct from old.id
     or new.slug is distinct from old.slug
     or new.status is distinct from old.status
     or new.contracted_users is distinct from old.contracted_users
     or new.legacy_owner_id is distinct from old.legacy_owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Somente a administração da plataforma pode alterar plano, status ou identificação da empresa.'
      using errcode = '42501';
  end if;
  if new.logo_url is distinct from old.logo_url and new.logo_url is not null
     and position(base || new.id::text || '/' in new.logo_url) <> 1 then
    raise exception 'A logo precisa ser enviada pela tela Aparência da própria empresa.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger trg_guard_organizations_update
  before update on public.organizations
  for each row execute function public.guard_organizations_update();

-- Desfazer:
--   drop trigger trg_guard_organizations_update on public.organizations;
--   drop function public.guard_organizations_update();
--   drop policy "org branding write" on storage.objects;  (idem update/delete)
--   alter table public.organizations drop column brand_color;
