export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          account_email: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      baixas: {
        Row: {
          conta_id: string | null
          created_at: string
          data: string
          despesa_id: string | null
          empresa_id: string
          forma_pagamento: string | null
          id: string
          receita_id: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          data?: string
          despesa_id?: string | null
          empresa_id: string
          forma_pagamento?: string | null
          id?: string
          receita_id?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          data?: string
          despesa_id?: string | null
          empresa_id?: string
          forma_pagamento?: string | null
          id?: string
          receita_id?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "baixas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baixas_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "finances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baixas_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "finances_calc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baixas_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "finances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baixas_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "finances_calc"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company: string | null
          contract_renewal: string | null
          contract_start: string | null
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          monthly_value: number | null
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          service: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          contract_renewal?: string | null
          contract_start?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          monthly_value?: number | null
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          service?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          contract_renewal?: string | null
          contract_start?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          monthly_value?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          service?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contas: {
        Row: {
          ativo: boolean
          created_at: string
          data_saldo_inicial: string
          empresa_id: string
          id: string
          nome: string
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_saldo_inicial?: string
          empresa_id: string
          id?: string
          nome: string
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_saldo_inicial?: string
          empresa_id?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          end_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          location: string | null
          owner_id: string
          project_id: string | null
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          location?: string | null
          owner_id: string
          project_id?: string | null
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          location?: string | null
          owner_id?: string
          project_id?: string | null
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          category: Database["public"]["Enums"]["file_category"]
          client_id: string | null
          created_at: string
          id: string
          mime_type: string | null
          name: string
          owner_id: string
          project_id: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["file_category"]
          client_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          owner_id: string
          project_id?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          category?: Database["public"]["Enums"]["file_category"]
          client_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          owner_id?: string
          project_id?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["finance_kind"]
          name: string
          owner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          kind: Database["public"]["Enums"]["finance_kind"]
          name: string
          owner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["finance_kind"]
          name?: string
          owner_id?: string | null
        }
        Relationships: []
      }
      finances: {
        Row: {
          amount: number
          category_id: string | null
          client_id: string | null
          competencia: string | null
          created_at: string
          description: string | null
          due_date: string
          id: string
          installment_no: number | null
          installment_total: number | null
          kind: Database["public"]["Enums"]["finance_kind"]
          natureza: string
          owner_id: string
          paid_at: string | null
          parent_id: string | null
          payment_method: string | null
          project_id: string | null
          recurrence: string
          recurrence_day: number | null
          recurrence_until: string | null
          repasse_origem_id: string | null
          servico_id: string | null
          status: Database["public"]["Enums"]["finance_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          client_id?: string | null
          competencia?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          installment_no?: number | null
          installment_total?: number | null
          kind: Database["public"]["Enums"]["finance_kind"]
          natureza?: string
          owner_id: string
          paid_at?: string | null
          parent_id?: string | null
          payment_method?: string | null
          project_id?: string | null
          recurrence?: string
          recurrence_day?: number | null
          recurrence_until?: string | null
          repasse_origem_id?: string | null
          servico_id?: string | null
          status?: Database["public"]["Enums"]["finance_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          client_id?: string | null
          competencia?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          installment_no?: number | null
          installment_total?: number | null
          kind?: Database["public"]["Enums"]["finance_kind"]
          natureza?: string
          owner_id?: string
          paid_at?: string | null
          parent_id?: string | null
          payment_method?: string | null
          project_id?: string | null
          recurrence?: string
          recurrence_day?: number | null
          recurrence_until?: string | null
          repasse_origem_id?: string | null
          servico_id?: string | null
          status?: Database["public"]["Enums"]["finance_status"]
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finances_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finances_calc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_repasse_origem_id_fkey"
            columns: ["repasse_origem_id"]
            isOneToOne: false
            referencedRelation: "finances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_repasse_origem_id_fkey"
            columns: ["repasse_origem_id"]
            isOneToOne: false
            referencedRelation: "finances_calc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      form_answers: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          option_id: string | null
          owner_id: string
          question_id: string
          score: number
          submission_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          option_id?: string | null
          owner_id: string
          question_id: string
          score?: number
          submission_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          option_id?: string | null
          owner_id?: string
          question_id?: string
          score?: number
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_answers_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "form_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_options: {
        Row: {
          created_at: string
          form_id: string
          id: string
          label: string
          next_question_id: string | null
          order_index: number
          owner_id: string
          question_id: string
          score: number
          value: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          label: string
          next_question_id?: string | null
          order_index?: number
          owner_id: string
          question_id: string
          score?: number
          value?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          label?: string
          next_question_id?: string | null
          order_index?: number
          owner_id?: string
          question_id?: string
          score?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_options_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_options_next_question_id_fkey"
            columns: ["next_question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          created_at: string
          form_id: string
          help_text: string | null
          id: string
          lead_field: string | null
          order_index: number
          owner_id: string
          question: string
          question_type: Database["public"]["Enums"]["form_question_type"]
          required: boolean
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_id: string
          help_text?: string | null
          id?: string
          lead_field?: string | null
          order_index?: number
          owner_id: string
          question: string
          question_type?: Database["public"]["Enums"]["form_question_type"]
          required?: boolean
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_id?: string
          help_text?: string | null
          id?: string
          lead_field?: string | null
          order_index?: number
          owner_id?: string
          question?: string
          question_type?: Database["public"]["Enums"]["form_question_type"]
          required?: boolean
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          completed_at: string | null
          form_id: string
          id: string
          landing_url: string | null
          lead_id: string | null
          metadata: Json
          owner_id: string
          referrer: string | null
          source: string | null
          started_at: string
          status: Database["public"]["Enums"]["form_submission_status"]
          temperature: string | null
          total_score: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_identifier: string | null
        }
        Insert: {
          completed_at?: string | null
          form_id: string
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          metadata?: Json
          owner_id: string
          referrer?: string | null
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["form_submission_status"]
          temperature?: string | null
          total_score?: number
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_identifier?: string | null
        }
        Update: {
          completed_at?: string | null
          form_id?: string
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          metadata?: Json
          owner_id?: string
          referrer?: string | null
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["form_submission_status"]
          temperature?: string | null
          total_score?: number
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          created_by: string | null
          default_source: string | null
          description: string | null
          id: string
          intro_message: string | null
          name: string
          owner_id: string
          pipeline_id: string | null
          pipeline_stage_id: string | null
          published_at: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["form_status"]
          success_message: string | null
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_source?: string | null
          description?: string | null
          id?: string
          intro_message?: string | null
          name: string
          owner_id: string
          pipeline_id?: string | null
          pipeline_stage_id?: string | null
          published_at?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["form_status"]
          success_message?: string | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_source?: string | null
          description?: string | null
          id?: string
          intro_message?: string | null
          name?: string
          owner_id?: string
          pipeline_id?: string | null
          pipeline_stage_id?: string | null
          published_at?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["form_status"]
          success_message?: string | null
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connections: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          google_email: string | null
          id: string
          last_error: string | null
          refresh_token: string | null
          scopes: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          last_error?: string | null
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          last_error?: string | null
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_oauth_config: {
        Row: {
          client_id: string | null
          client_secret: string | null
          enabled_scopes: string[]
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret?: string | null
          enabled_scopes?: string[]
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret?: string | null
          enabled_scopes?: string[]
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      google_oauth_logs: {
        Row: {
          account_email: string | null
          action: string
          connector_id: string
          created_at: string
          id: string
          message: string | null
          meta: Json
          status: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          action: string
          connector_id: string
          created_at?: string
          id?: string
          message?: string | null
          meta?: Json
          status: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          action?: string
          connector_id?: string
          created_at?: string
          id?: string
          message?: string | null
          meta?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      google_sheets_sync: {
        Row: {
          created_at: string
          entity_type: string
          sheet_name: string
          spreadsheet_id: string
          spreadsheet_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          sheet_name?: string
          spreadsheet_id: string
          spreadsheet_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          sheet_name?: string
          spreadsheet_id?: string
          spreadsheet_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kanban_columns: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          position: number
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          position?: number
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          position?: number
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          lead_id: string
          meta: Json
          owner_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          lead_id: string
          meta?: Json
          owner_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          lead_id?: string
          meta?: Json
          owner_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_files: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          mime_type: string | null
          name: string
          owner_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          mime_type?: string | null
          name: string
          owner_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          mime_type?: string | null
          name?: string
          owner_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_files_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          lead_id: string
          owner_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          lead_id: string
          owner_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          done: boolean
          due_at: string | null
          duration_minutes: number
          gcal_event_id: string | null
          id: string
          kind: string
          lead_id: string
          meet_link: string | null
          notes: string | null
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          duration_minutes?: number
          gcal_event_id?: string | null
          id?: string
          kind?: string
          lead_id: string
          meet_link?: string | null
          notes?: string | null
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          duration_minutes?: number
          gcal_event_id?: string | null
          id?: string
          kind?: string
          lead_id?: string
          meet_link?: string | null
          notes?: string | null
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_webhooks: {
        Row: {
          active: boolean
          call_count: number
          created_at: string
          default_source: string | null
          default_stage_id: string | null
          direction: string
          field_map: Json
          id: string
          last_called_at: string | null
          last_payload: Json | null
          last_payload_at: string | null
          name: string
          owner_id: string
          secret: string
          target_url: string | null
          token: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          call_count?: number
          created_at?: string
          default_source?: string | null
          default_stage_id?: string | null
          direction?: string
          field_map?: Json
          id?: string
          last_called_at?: string | null
          last_payload?: Json | null
          last_payload_at?: string | null
          name: string
          owner_id: string
          secret?: string
          target_url?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          call_count?: number
          created_at?: string
          default_source?: string | null
          default_stage_id?: string | null
          direction?: string
          field_map?: Json
          id?: string
          last_called_at?: string | null
          last_payload?: Json | null
          last_payload_at?: string | null
          name?: string
          owner_id?: string
          secret?: string
          target_url?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_webhooks_default_stage_id_fkey"
            columns: ["default_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assignee_id: string | null
          city: string | null
          client_id: string | null
          company: string | null
          created_at: string
          email: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          landing_url: string | null
          last_contact_at: string | null
          metadata: Json
          name: string
          owner_id: string
          phone: string | null
          position: number
          referrer: string | null
          source: string | null
          stage_id: string | null
          state: string | null
          status: string
          tags: string[]
          temperature: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          value: number | null
        }
        Insert: {
          assignee_id?: string | null
          city?: string | null
          client_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_url?: string | null
          last_contact_at?: string | null
          metadata?: Json
          name: string
          owner_id: string
          phone?: string | null
          position?: number
          referrer?: string | null
          source?: string | null
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Update: {
          assignee_id?: string | null
          city?: string | null
          client_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_url?: string | null
          last_contact_at?: string | null
          metadata?: Json
          name?: string
          owner_id?: string
          phone?: string | null
          position?: number
          referrer?: string | null
          source?: string | null
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          redirect_uri: string
          scopes: string[]
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          redirect_uri: string
          scopes?: string[]
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scopes?: string[]
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          owner_id: string
          pipeline_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          owner_id: string
          pipeline_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          owner_id?: string
          pipeline_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          id: string
          meta: Json | null
          owner_id: string
          project_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          id?: string
          meta?: Json | null
          owner_id: string
          project_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          id?: string
          meta?: Json | null
          owner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_costs: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          incurred_at: string
          kind: string
          owner_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incurred_at?: string
          kind?: string
          owner_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incurred_at?: string
          kind?: string
          owner_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          owner_id: string
          project_id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          owner_id: string
          project_id: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          owner_id?: string
          project_id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          owner_id: string
          position: number
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id: string
          position?: number
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string
          position?: number
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          content_html: string
          created_at: string
          id: string
          owner_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content_html?: string
          created_at?: string
          id?: string
          owner_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_risks: {
        Row: {
          assignee_id: string | null
          created_at: string
          description: string | null
          id: string
          owner_id: string
          project_id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          project_id: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          project_id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billing_day: number | null
          client_id: string | null
          color: string | null
          commercial_model: string
          contract_value: number | null
          contracted_hours: number | null
          created_at: string
          description: string | null
          due_date: string | null
          hourly_rate: number | null
          id: string
          manager_id: string | null
          monthly_value: number | null
          name: string
          next_billing_date: string | null
          owner_id: string
          progress: number
          roadmap_stages: Json
          service_type: string | null
          servico_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          value: number | null
        }
        Insert: {
          billing_day?: number | null
          client_id?: string | null
          color?: string | null
          commercial_model?: string
          contract_value?: number | null
          contracted_hours?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          hourly_rate?: number | null
          id?: string
          manager_id?: string | null
          monthly_value?: number | null
          name: string
          next_billing_date?: string | null
          owner_id: string
          progress?: number
          roadmap_stages?: Json
          service_type?: string | null
          servico_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          billing_day?: number | null
          client_id?: string | null
          color?: string | null
          commercial_model?: string
          contract_value?: number | null
          contracted_hours?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          hourly_rate?: number | null
          id?: string
          manager_id?: string | null
          monthly_value?: number | null
          name?: string
          next_billing_date?: string | null
          owner_id?: string
          progress?: number
          roadmap_stages?: Json
          service_type?: string | null
          servico_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      servicos: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          id: string
          mime: string | null
          name: string
          owner_id: string
          size: number
          storage_path: string
          task_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          id?: string
          mime?: string | null
          name: string
          owner_id: string
          size: number
          storage_path: string
          task_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          id?: string
          mime?: string | null
          name?: string
          owner_id?: string
          size?: number
          storage_path?: string
          task_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklists: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          owner_id: string
          position: number
          task_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          owner_id: string
          position?: number
          task_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          owner_id?: string
          position?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          mentions: string[]
          owner_id: string
          parent_id: string | null
          task_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          owner_id: string
          parent_id?: string | null
          task_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          owner_id?: string
          parent_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_communications: {
        Row: {
          actor_id: string | null
          body_snippet: string | null
          created_at: string
          id: string
          kind: string
          meet_link: string | null
          metadata: Json
          owner_id: string
          provider_id: string | null
          recipients: string[]
          start_at: string | null
          subject: string | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          body_snippet?: string | null
          created_at?: string
          id?: string
          kind: string
          meet_link?: string | null
          metadata?: Json
          owner_id: string
          provider_id?: string | null
          recipients?: string[]
          start_at?: string | null
          subject?: string | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          body_snippet?: string | null
          created_at?: string
          id?: string
          kind?: string
          meet_link?: string | null
          metadata?: Json
          owner_id?: string
          provider_id?: string | null
          recipients?: string[]
          start_at?: string | null
          subject?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_communications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_custom_fields: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          options: Json | null
          owner_id: string
          position: number
          type: Database["public"]["Enums"]["custom_field_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          options?: Json | null
          owner_id: string
          position?: number
          type?: Database["public"]["Enums"]["custom_field_type"]
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          owner_id?: string
          position?: number
          type?: Database["public"]["Enums"]["custom_field_type"]
        }
        Relationships: []
      }
      task_custom_values: {
        Row: {
          field_id: string
          id: string
          owner_id: string
          task_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          field_id: string
          id?: string
          owner_id: string
          task_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          field_id?: string
          id?: string
          owner_id?: string
          task_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_custom_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "task_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_custom_values_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
          owner_id: string
          task_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          owner_id: string
          task_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          owner_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_label_assignments: {
        Row: {
          created_at: string
          label_id: string
          owner_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          owner_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          owner_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "task_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_label_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      task_push_log: {
        Row: {
          id: string
          kind: string
          sent_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          sent_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_push_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_related: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["task_resource_type"]
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["task_resource_type"]
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["task_resource_type"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_related_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assignee_id: string | null
          billable: boolean
          briefing: Json | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          generated_value: number | null
          id: string
          internal_cost: number | null
          internal_notes: string | null
          owner_id: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          start_date: string | null
          status: string
          time_spent_minutes: number
          title: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assignee_id?: string | null
          billable?: boolean
          briefing?: Json | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          generated_value?: number | null
          id?: string
          internal_cost?: number | null
          internal_notes?: string | null
          owner_id: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_date?: string | null
          status?: string
          time_spent_minutes?: number
          title: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assignee_id?: string | null
          billable?: boolean
          briefing?: Json | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          generated_value?: number | null
          id?: string
          internal_cost?: number | null
          internal_notes?: string | null
          owner_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_date?: string | null
          status?: string
          time_spent_minutes?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_modules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          installed_at: string | null
          module_slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          installed_at?: string | null
          module_slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          installed_at?: string | null
          module_slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      finances_calc: {
        Row: {
          amount: number | null
          category_id: string | null
          client_id: string | null
          competencia: string | null
          created_at: string | null
          description: string | null
          dias_atraso: number | null
          due_date: string | null
          em_atraso: boolean | null
          id: string | null
          installment_no: number | null
          installment_total: number | null
          kind: Database["public"]["Enums"]["finance_kind"] | null
          natureza: string | null
          owner_id: string | null
          paid_at: string | null
          parent_id: string | null
          payment_method: string | null
          project_id: string | null
          recurrence: string | null
          recurrence_day: number | null
          recurrence_until: string | null
          saldo: number | null
          status: Database["public"]["Enums"]["finance_status"] | null
          supplier: string | null
          updated_at: string | null
          valor_pago: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finances_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finances_calc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connections_public: {
        Row: {
          expires_at: string | null
          google_email: string | null
          last_error: string | null
          scopes: string[] | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          expires_at?: string | null
          google_email?: string | null
          last_error?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          expires_at?: string | null
          google_email?: string | null
          last_error?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      recalc_finance_status: {
        Args: { _finance_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      client_status: "ativo" | "prospecto" | "inadimplente" | "inativo"
      custom_field_type: "text" | "number" | "date" | "select" | "url"
      event_type: "reuniao" | "entrega" | "call" | "pagamento" | "follow_up"
      file_category:
        | "contratos"
        | "propostas"
        | "financeiro"
        | "projetos"
        | "artes"
        | "videos"
      finance_kind: "receber" | "pagar"
      finance_status: "aberto" | "parcial" | "quitado" | "cancelado"
      form_question_type:
        | "single_choice"
        | "multi_choice"
        | "short_text"
        | "long_text"
        | "email"
        | "phone"
        | "number"
        | "date"
        | "rating"
        | "consent"
      form_status: "rascunho" | "publicado" | "pausado"
      form_submission_status: "iniciado" | "concluido" | "abandonado"
      project_status:
        | "planejamento"
        | "em_andamento"
        | "aguardando"
        | "concluido"
        | "cancelado"
        | "ativo"
        | "aguardando_cliente"
        | "em_pausa"
      task_priority: "baixa" | "media" | "alta" | "critica"
      task_resource_type: "task" | "project" | "client" | "event" | "file"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      client_status: ["ativo", "prospecto", "inadimplente", "inativo"],
      custom_field_type: ["text", "number", "date", "select", "url"],
      event_type: ["reuniao", "entrega", "call", "pagamento", "follow_up"],
      file_category: [
        "contratos",
        "propostas",
        "financeiro",
        "projetos",
        "artes",
        "videos",
      ],
      finance_kind: ["receber", "pagar"],
      finance_status: ["aberto", "parcial", "quitado", "cancelado"],
      form_question_type: [
        "single_choice",
        "multi_choice",
        "short_text",
        "long_text",
        "email",
        "phone",
        "number",
        "date",
        "rating",
        "consent",
      ],
      form_status: ["rascunho", "publicado", "pausado"],
      form_submission_status: ["iniciado", "concluido", "abandonado"],
      project_status: [
        "planejamento",
        "em_andamento",
        "aguardando",
        "concluido",
        "cancelado",
        "ativo",
        "aguardando_cliente",
        "em_pausa",
      ],
      task_priority: ["baixa", "media", "alta", "critica"],
      task_resource_type: ["task", "project", "client", "event", "file"],
    },
  },
} as const
