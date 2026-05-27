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
      businesses: {
        Row: {
          business_type: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          platform_tenant_id: string
        }
        Insert: {
          business_type?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          platform_tenant_id: string
        }
        Update: {
          business_type?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          platform_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_default: boolean
          kind: string
          name: string
          platform_tenant_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          kind: string
          name: string
          platform_tenant_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          platform_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tenant_members: {
        Row: {
          created_at: string
          platform_tenant_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          platform_tenant_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          platform_tenant_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_tenant_members_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      rule_actions: {
        Row: {
          action_type: string
          id: string
          rule_id: string
          value_json: Json
        }
        Insert: {
          action_type: string
          id?: string
          rule_id: string
          value_json: Json
        }
        Update: {
          action_type?: string
          id?: string
          rule_id?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rule_actions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_conditions: {
        Row: {
          field: string
          group_id: number
          id: string
          operator: string
          rule_id: string
          value_json: Json
        }
        Insert: {
          field: string
          group_id: number
          id?: string
          operator: string
          rule_id: string
          value_json: Json
        }
        Update: {
          field?: string
          group_id?: number
          id?: string
          operator?: string
          rule_id?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rule_conditions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          rule_id: string
          snapshot_json: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          rule_id: string
          snapshot_json: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          rule_id?: string
          snapshot_json?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          current_version_id: string | null
          description: string | null
          enabled: boolean
          id: string
          mode: string
          name: string
          platform_tenant_id: string
          priority: number
          xero_tenant_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          current_version_id?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: string
          name: string
          platform_tenant_id: string
          priority: number
          xero_tenant_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: string
          name?: string
          platform_tenant_id?: string
          priority?: number
          xero_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_rule_matches: {
        Row: {
          accepted_at: string | null
          action_applied: boolean
          ai_confidence: number | null
          ai_model: string | null
          id: string
          matched_at: string
          override_at: string | null
          override_by_user_id: string | null
          rule_id: string | null
          rule_version_id: string | null
          suggested_category_id: string | null
          suggested_contact_id: string | null
          suggested_project_id: string | null
          suggested_tax_rate_id: string | null
          suggestion_source: string
          xero_bank_transaction_id: string
        }
        Insert: {
          accepted_at?: string | null
          action_applied?: boolean
          ai_confidence?: number | null
          ai_model?: string | null
          id?: string
          matched_at?: string
          override_at?: string | null
          override_by_user_id?: string | null
          rule_id?: string | null
          rule_version_id?: string | null
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_project_id?: string | null
          suggested_tax_rate_id?: string | null
          suggestion_source?: string
          xero_bank_transaction_id: string
        }
        Update: {
          accepted_at?: string | null
          action_applied?: boolean
          ai_confidence?: number | null
          ai_model?: string | null
          id?: string
          matched_at?: string
          override_at?: string | null
          override_by_user_id?: string | null
          rule_id?: string | null
          rule_version_id?: string | null
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_project_id?: string | null
          suggested_tax_rate_id?: string | null
          suggestion_source?: string
          xero_bank_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_rule_matches_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_rule_matches_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_rule_matches_xero_bank_transaction_id_fkey"
            columns: ["xero_bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "xero_bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          business_id: string
          category_id: string
          created_at: string
          currency: string
          date: string
          id: string
          note: string | null
          platform_tenant_id: string
          type: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          category_id: string
          created_at?: string
          currency?: string
          date: string
          id?: string
          note?: string | null
          platform_tenant_id: string
          type: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          category_id?: string
          created_at?: string
          currency?: string
          date?: string
          id?: string
          note?: string | null
          platform_tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_accounts: {
        Row: {
          class: string | null
          code: string | null
          enable_payments_to_account: boolean | null
          id: string
          name: string
          platform_tenant_id: string
          raw_json: Json
          show_in_expense_claims: boolean | null
          status: string | null
          synced_at: string
          tax_type: string | null
          type: string | null
          updated_xero_at: string | null
          xero_account_id: string
          xero_tenant_id: string
        }
        Insert: {
          class?: string | null
          code?: string | null
          enable_payments_to_account?: boolean | null
          id?: string
          name: string
          platform_tenant_id: string
          raw_json?: Json
          show_in_expense_claims?: boolean | null
          status?: string | null
          synced_at?: string
          tax_type?: string | null
          type?: string | null
          updated_xero_at?: string | null
          xero_account_id: string
          xero_tenant_id: string
        }
        Update: {
          class?: string | null
          code?: string | null
          enable_payments_to_account?: boolean | null
          id?: string
          name?: string
          platform_tenant_id?: string
          raw_json?: Json
          show_in_expense_claims?: boolean | null
          status?: string | null
          synced_at?: string
          tax_type?: string | null
          type?: string | null
          updated_xero_at?: string | null
          xero_account_id?: string
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_accounts_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_accounts_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
      xero_api_calls: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_text: string | null
          id: string
          method: string
          platform_tenant_id: string
          retry_count: number
          status: number | null
          xero_tenant_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_text?: string | null
          id?: string
          method: string
          platform_tenant_id: string
          retry_count?: number
          status?: number | null
          xero_tenant_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_text?: string | null
          id?: string
          method?: string
          platform_tenant_id?: string
          retry_count?: number
          status?: number | null
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_api_calls_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_bank_transactions: {
        Row: {
          bank_account_id: string | null
          contact_id: string | null
          currency: string | null
          date: string | null
          description: string | null
          id: string
          is_reconciled: boolean
          platform_tenant_id: string
          raw_json: Json
          reference: string | null
          status: string | null
          subtotal_cents: number | null
          synced_at: string
          tax_cents: number | null
          total_cents: number | null
          type: string | null
          updated_xero_at: string | null
          user_overridden_at: string | null
          user_override_json: Json | null
          xero_tenant_id: string
          xero_transaction_id: string
        }
        Insert: {
          bank_account_id?: string | null
          contact_id?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_reconciled?: boolean
          platform_tenant_id: string
          raw_json?: Json
          reference?: string | null
          status?: string | null
          subtotal_cents?: number | null
          synced_at?: string
          tax_cents?: number | null
          total_cents?: number | null
          type?: string | null
          updated_xero_at?: string | null
          user_overridden_at?: string | null
          user_override_json?: Json | null
          xero_tenant_id: string
          xero_transaction_id: string
        }
        Update: {
          bank_account_id?: string | null
          contact_id?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_reconciled?: boolean
          platform_tenant_id?: string
          raw_json?: Json
          reference?: string | null
          status?: string | null
          subtotal_cents?: number | null
          synced_at?: string
          tax_cents?: number | null
          total_cents?: number | null
          type?: string | null
          updated_xero_at?: string | null
          user_overridden_at?: string | null
          user_override_json?: Json | null
          xero_tenant_id?: string
          xero_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_bank_account_id_fkey"
            columns: ["platform_tenant_id", "bank_account_id"]
            isOneToOne: false
            referencedRelation: "xero_accounts"
            referencedColumns: ["platform_tenant_id", "id"]
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_contact_id_fkey"
            columns: ["platform_tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "xero_contacts"
            referencedColumns: ["platform_tenant_id", "id"]
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
      xero_connections: {
        Row: {
          access_token_expires_at: string
          created_at: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          id: string
          last_synced_at: string | null
          platform_tenant_id: string
          rotated_at: string
          scopes: string[]
          status: string
          xero_tenant_id: string
          xero_tenant_name: string | null
        }
        Insert: {
          access_token_expires_at: string
          created_at?: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          id?: string
          last_synced_at?: string | null
          platform_tenant_id: string
          rotated_at?: string
          scopes: string[]
          status?: string
          xero_tenant_id: string
          xero_tenant_name?: string | null
        }
        Update: {
          access_token_expires_at?: string
          created_at?: string
          encrypted_access_token?: string
          encrypted_refresh_token?: string
          id?: string
          last_synced_at?: string | null
          platform_tenant_id?: string
          rotated_at?: string
          scopes?: string[]
          status?: string
          xero_tenant_id?: string
          xero_tenant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_connections_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_contacts: {
        Row: {
          email: string | null
          id: string
          is_customer: boolean
          is_supplier: boolean
          name: string
          platform_tenant_id: string
          raw_json: Json
          synced_at: string
          updated_xero_at: string | null
          xero_contact_id: string
          xero_tenant_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          is_customer?: boolean
          is_supplier?: boolean
          name: string
          platform_tenant_id: string
          raw_json?: Json
          synced_at?: string
          updated_xero_at?: string | null
          xero_contact_id: string
          xero_tenant_id: string
        }
        Update: {
          email?: string | null
          id?: string
          is_customer?: boolean
          is_supplier?: boolean
          name?: string
          platform_tenant_id?: string
          raw_json?: Json
          synced_at?: string
          updated_xero_at?: string | null
          xero_contact_id?: string
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_contacts_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_contacts_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
      xero_invoices: {
        Row: {
          attachment_path: string | null
          attachment_status: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          date: string | null
          due_date: string | null
          id: string
          line_items_json: Json
          platform_tenant_id: string
          publish_error: string | null
          published_to_xero_at: string | null
          reference: string | null
          status: string
          subtotal_cents: number | null
          tax_cents: number | null
          total_cents: number | null
          type: string
          xero_invoice_id: string | null
          xero_invoice_number: string | null
          xero_tenant_id: string
        }
        Insert: {
          attachment_path?: string | null
          attachment_status?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          line_items_json?: Json
          platform_tenant_id: string
          publish_error?: string | null
          published_to_xero_at?: string | null
          reference?: string | null
          status?: string
          subtotal_cents?: number | null
          tax_cents?: number | null
          total_cents?: number | null
          type: string
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
          xero_tenant_id: string
        }
        Update: {
          attachment_path?: string | null
          attachment_status?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          line_items_json?: Json
          platform_tenant_id?: string
          publish_error?: string | null
          published_to_xero_at?: string | null
          reference?: string | null
          status?: string
          subtotal_cents?: number | null
          tax_cents?: number | null
          total_cents?: number | null
          type?: string
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_contact_id_fkey"
            columns: ["platform_tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "xero_contacts"
            referencedColumns: ["platform_tenant_id", "id"]
          },
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
      xero_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          platform_tenant_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          platform_tenant_id: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          platform_tenant_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_oauth_states_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_tax_rates: {
        Row: {
          id: string
          name: string
          platform_tenant_id: string
          rate: number | null
          raw_json: Json
          status: string | null
          synced_at: string
          xero_tax_type: string
          xero_tenant_id: string
        }
        Insert: {
          id?: string
          name: string
          platform_tenant_id: string
          rate?: number | null
          raw_json?: Json
          status?: string | null
          synced_at?: string
          xero_tax_type: string
          xero_tenant_id: string
        }
        Update: {
          id?: string
          name?: string
          platform_tenant_id?: string
          rate?: number | null
          raw_json?: Json
          status?: string | null
          synced_at?: string
          xero_tax_type?: string
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_tax_rates_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_tax_rates_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
      xero_webhook_events: {
        Row: {
          event_date_utc: string | null
          event_id: string
          event_type: string | null
          platform_tenant_id: string
          processed_at: string | null
          received_at: string
          resource_id: string | null
          resource_type: string | null
          xero_tenant_id: string
        }
        Insert: {
          event_date_utc?: string | null
          event_id: string
          event_type?: string | null
          platform_tenant_id: string
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          resource_type?: string | null
          xero_tenant_id: string
        }
        Update: {
          event_date_utc?: string | null
          event_id?: string
          event_type?: string | null
          platform_tenant_id?: string
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          resource_type?: string | null
          xero_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_webhook_events_platform_tenant_id_fkey"
            columns: ["platform_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_webhook_events_platform_tenant_id_xero_tenant_id_fkey"
            columns: ["platform_tenant_id", "xero_tenant_id"]
            isOneToOne: false
            referencedRelation: "xero_connections"
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_platform_tenant_id: { Args: never; Returns: string }
      ensure_user_platform_tenant: {
        Args: { p_user_id: string }
        Returns: string
      }
      is_platform_tenant_member: {
        Args: { p_platform_tenant_id: string }
        Returns: boolean
      }
      platform_tenant_slug_from_email: {
        Args: { p_email: string; p_position: number; p_user_id: string }
        Returns: string
      }
      set_current_tenant: {
        Args: { p_platform_tenant_id: string }
        Returns: string
      }
      xero_decrypt_token: { Args: { cipher: string }; Returns: string }
      xero_encrypt_token: { Args: { plain: string }; Returns: string }
      xero_lock_connection_refresh: {
        Args: { connection_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
