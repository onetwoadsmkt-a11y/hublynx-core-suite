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
          created_at: string
          description: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["finance_kind"]
          owner_id: string
          paid_at: string | null
          payment_method: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["finance_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          kind: Database["public"]["Enums"]["finance_kind"]
          owner_id: string
          paid_at?: string | null
          payment_method?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["finance_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["finance_kind"]
          owner_id?: string
          paid_at?: string | null
          payment_method?: string | null
          project_id?: string | null
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
            foreignKeyName: "finances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          client_id: string | null
          color: string | null
          contract_value: number | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          manager_id: string | null
          name: string
          owner_id: string
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          value: number | null
        }
        Insert: {
          client_id?: string | null
          color?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          manager_id?: string | null
          name: string
          owner_id: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          client_id?: string | null
          color?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          owner_id?: string
          progress?: number
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
        ]
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
          briefing: Json | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          internal_notes: string | null
          owner_id: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assignee_id?: string | null
          briefing?: Json | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          internal_notes?: string | null
          owner_id: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assignee_id?: string | null
          briefing?: Json | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          internal_notes?: string | null
          owner_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_date?: string | null
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      finance_status: "pendente" | "pago" | "atrasado"
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
      finance_status: ["pendente", "pago", "atrasado"],
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
