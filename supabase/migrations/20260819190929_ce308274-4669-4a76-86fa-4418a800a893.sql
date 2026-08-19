-- ============ HUBLYNX FORMS ============
CREATE TYPE public.form_status AS ENUM ('rascunho', 'publicado', 'pausado');
CREATE TYPE public.form_question_type AS ENUM ('single_choice','multi_choice','short_text','long_text','email','phone','number','date','rating','consent');
CREATE TYPE public.form_submission_status AS ENUM ('iniciado','concluido','abandonado');

-- 1) forms
CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  slug text NOT NULL UNIQUE,
  status public.form_status NOT NULL DEFAULT 'rascunho',
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  default_source text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  intro_message text,
  success_message text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT SELECT ON public.forms TO anon;
GRANT ALL ON public.forms TO service_role;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forms_owner_all" ON public.forms FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "forms_public_read_published" ON public.forms FOR SELECT TO anon
  USING (status = 'publicado');
CREATE INDEX idx_forms_owner ON public.forms(owner_id);
CREATE INDEX idx_forms_slug ON public.forms(slug);

-- 2) form_questions
CREATE TABLE public.form_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  question text NOT NULL,
  help_text text,
  question_type public.form_question_type NOT NULL DEFAULT 'single_choice',
  order_index integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  lead_field text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_questions TO authenticated;
GRANT SELECT ON public.form_questions TO anon;
GRANT ALL ON public.form_questions TO service_role;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_questions_owner_all" ON public.form_questions FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "form_questions_public_read" ON public.form_questions FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND f.status = 'publicado'));
CREATE INDEX idx_form_questions_form ON public.form_questions(form_id, order_index);

-- 3) form_options
CREATE TABLE public.form_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  label text NOT NULL,
  value text,
  order_index integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  next_question_id uuid REFERENCES public.form_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_options TO authenticated;
GRANT SELECT ON public.form_options TO anon;
GRANT ALL ON public.form_options TO service_role;
ALTER TABLE public.form_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_options_owner_all" ON public.form_options FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "form_options_public_read" ON public.form_options FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND f.status = 'publicado'));
CREATE INDEX idx_form_options_question ON public.form_options(question_id, order_index);

-- 4) form_submissions
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  visitor_identifier text,
  status public.form_submission_status NOT NULL DEFAULT 'iniciado',
  total_score integer NOT NULL DEFAULT 0,
  temperature text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  referrer text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT INSERT, UPDATE ON public.form_submissions TO anon;
GRANT ALL ON public.form_submissions TO service_role;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submissions_owner_all" ON public.form_submissions FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "form_submissions_public_insert" ON public.form_submissions FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_submissions.form_id
      AND f.status = 'publicado'
      AND f.owner_id = form_submissions.owner_id
  ));
CREATE INDEX idx_form_submissions_form ON public.form_submissions(form_id, started_at DESC);
CREATE INDEX idx_form_submissions_owner ON public.form_submissions(owner_id);

-- 5) form_answers
CREATE TABLE public.form_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  option_id uuid REFERENCES public.form_options(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL,
  answer text,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_answers TO authenticated;
GRANT INSERT ON public.form_answers TO anon;
GRANT ALL ON public.form_answers TO service_role;
ALTER TABLE public.form_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_answers_owner_all" ON public.form_answers FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "form_answers_public_insert" ON public.form_answers FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.form_submissions s
    JOIN public.forms f ON f.id = s.form_id
    WHERE s.id = form_answers.submission_id
      AND s.owner_id = form_answers.owner_id
      AND f.status = 'publicado'
  ));
CREATE INDEX idx_form_answers_submission ON public.form_answers(submission_id);

-- triggers de updated_at (função já existente)
CREATE TRIGGER trg_forms_updated BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_form_questions_updated BEFORE UPDATE ON public.form_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();