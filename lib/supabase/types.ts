export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          platform_tenant_id: string;
          owner_id: string;
          name: string;
          business_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id?: string;
          owner_id: string;
          name: string;
          business_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          owner_id?: string;
          name?: string;
          business_type?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          platform_tenant_id: string;
          business_id: string;
          name: string;
          kind: "income" | "expense";
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id?: string;
          business_id: string;
          name: string;
          kind: "income" | "expense";
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          business_id?: string;
          name?: string;
          kind?: "income" | "expense";
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          platform_tenant_id: string;
          business_id: string;
          category_id: string;
          type: "income" | "expense";
          amount_cents: number;
          currency: string;
          date: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id?: string;
          business_id: string;
          category_id: string;
          type: "income" | "expense";
          amount_cents: number;
          currency?: string;
          date: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          business_id?: string;
          category_id?: string;
          type?: "income" | "expense";
          amount_cents?: number;
          currency?: string;
          date?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      xero_accounts: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_account_id: string;
          code: string | null;
          name: string;
          type: string | null;
          class: string | null;
          status: string | null;
          tax_type: string | null;
          enable_payments_to_account: boolean | null;
          show_in_expense_claims: boolean | null;
          raw_json: Json;
          updated_xero_at: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_account_id: string;
          code?: string | null;
          name: string;
          type?: string | null;
          class?: string | null;
          status?: string | null;
          tax_type?: string | null;
          enable_payments_to_account?: boolean | null;
          show_in_expense_claims?: boolean | null;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          xero_account_id?: string;
          code?: string | null;
          name?: string;
          type?: string | null;
          class?: string | null;
          status?: string | null;
          tax_type?: string | null;
          enable_payments_to_account?: boolean | null;
          show_in_expense_claims?: boolean | null;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_accounts_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_accounts_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
        ];
      };
      xero_api_calls: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          endpoint: string;
          method: string;
          status: number | null;
          duration_ms: number | null;
          retry_count: number;
          error_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          endpoint: string;
          method: string;
          status?: number | null;
          duration_ms?: number | null;
          retry_count?: number;
          error_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          endpoint?: string;
          method?: string;
          status?: number | null;
          duration_ms?: number | null;
          retry_count?: number;
          error_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_api_calls_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      xero_bank_transactions: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_transaction_id: string;
          bank_account_id: string | null;
          type: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
          status: string | null;
          is_reconciled: boolean;
          contact_id: string | null;
          date: string | null;
          description: string | null;
          reference: string | null;
          currency: string | null;
          total_cents: number | null;
          tax_cents: number | null;
          subtotal_cents: number | null;
          user_overridden_at: string | null;
          user_override_json: Json | null;
          raw_json: Json;
          updated_xero_at: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_transaction_id: string;
          bank_account_id?: string | null;
          type?: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
          status?: string | null;
          is_reconciled?: boolean;
          contact_id?: string | null;
          date?: string | null;
          description?: string | null;
          reference?: string | null;
          currency?: string | null;
          total_cents?: number | null;
          tax_cents?: number | null;
          subtotal_cents?: number | null;
          user_overridden_at?: string | null;
          user_override_json?: Json | null;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          xero_transaction_id?: string;
          bank_account_id?: string | null;
          type?: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
          status?: string | null;
          is_reconciled?: boolean;
          contact_id?: string | null;
          date?: string | null;
          description?: string | null;
          reference?: string | null;
          currency?: string | null;
          total_cents?: number | null;
          tax_cents?: number | null;
          subtotal_cents?: number | null;
          user_overridden_at?: string | null;
          user_override_json?: Json | null;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_bank_account_id_fkey";
            columns: ["platform_tenant_id", "bank_account_id"];
            isOneToOne: false;
            referencedRelation: "xero_accounts";
            referencedColumns: ["platform_tenant_id", "id"];
          },
          {
            foreignKeyName: "xero_bank_transactions_platform_tenant_id_contact_id_fkey";
            columns: ["platform_tenant_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "xero_contacts";
            referencedColumns: ["platform_tenant_id", "id"];
          },
        ];
      };
      xero_connections: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_tenant_name: string | null;
          encrypted_access_token: string;
          encrypted_refresh_token: string;
          access_token_expires_at: string;
          scopes: string[];
          status: "active" | "reauth_required" | "disconnected";
          last_synced_at: string | null;
          rotated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_tenant_name?: string | null;
          encrypted_access_token: string;
          encrypted_refresh_token: string;
          access_token_expires_at: string;
          scopes: string[];
          status?: "active" | "reauth_required" | "disconnected";
          last_synced_at?: string | null;
          rotated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          xero_tenant_name?: string | null;
          encrypted_access_token?: string;
          encrypted_refresh_token?: string;
          access_token_expires_at?: string;
          scopes?: string[];
          status?: "active" | "reauth_required" | "disconnected";
          last_synced_at?: string | null;
          rotated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_connections_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      xero_contacts: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_contact_id: string;
          name: string;
          email: string | null;
          is_supplier: boolean;
          is_customer: boolean;
          raw_json: Json;
          updated_xero_at: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_contact_id: string;
          name: string;
          email?: string | null;
          is_supplier?: boolean;
          is_customer?: boolean;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          xero_contact_id?: string;
          name?: string;
          email?: string | null;
          is_supplier?: boolean;
          is_customer?: boolean;
          raw_json?: Json;
          updated_xero_at?: string | null;
          synced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_contacts_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_contacts_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
        ];
      };
      xero_invoices: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          type: "ACCREC" | "ACCPAY";
          status: "draft_local" | "publishing" | "published" | "publish_failed";
          xero_invoice_id: string | null;
          xero_invoice_number: string | null;
          contact_id: string | null;
          date: string | null;
          due_date: string | null;
          reference: string | null;
          line_items_json: Json;
          subtotal_cents: number | null;
          tax_cents: number | null;
          total_cents: number | null;
          currency: string | null;
          attachment_path: string | null;
          attachment_status: string | null;
          published_to_xero_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          type: "ACCREC" | "ACCPAY";
          status?: "draft_local" | "publishing" | "published" | "publish_failed";
          xero_invoice_id?: string | null;
          xero_invoice_number?: string | null;
          contact_id?: string | null;
          date?: string | null;
          due_date?: string | null;
          reference?: string | null;
          line_items_json?: Json;
          subtotal_cents?: number | null;
          tax_cents?: number | null;
          total_cents?: number | null;
          currency?: string | null;
          attachment_path?: string | null;
          attachment_status?: string | null;
          published_to_xero_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          type?: "ACCREC" | "ACCPAY";
          status?: "draft_local" | "publishing" | "published" | "publish_failed";
          xero_invoice_id?: string | null;
          xero_invoice_number?: string | null;
          contact_id?: string | null;
          date?: string | null;
          due_date?: string | null;
          reference?: string | null;
          line_items_json?: Json;
          subtotal_cents?: number | null;
          tax_cents?: number | null;
          total_cents?: number | null;
          currency?: string | null;
          attachment_path?: string | null;
          attachment_status?: string | null;
          published_to_xero_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_invoices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
          {
            foreignKeyName: "xero_invoices_platform_tenant_id_contact_id_fkey";
            columns: ["platform_tenant_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "xero_contacts";
            referencedColumns: ["platform_tenant_id", "id"];
          },
        ];
      };
      xero_tax_rates: {
        Row: {
          id: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_tax_type: string;
          name: string;
          rate: number | null;
          status: string | null;
          raw_json: Json;
          synced_at: string;
        };
        Insert: {
          id?: string;
          platform_tenant_id: string;
          xero_tenant_id: string;
          xero_tax_type: string;
          name: string;
          rate?: number | null;
          status?: string | null;
          raw_json?: Json;
          synced_at?: string;
        };
        Update: {
          id?: string;
          platform_tenant_id?: string;
          xero_tenant_id?: string;
          xero_tax_type?: string;
          name?: string;
          rate?: number | null;
          status?: string | null;
          raw_json?: Json;
          synced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xero_tax_rates_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_tax_rates_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
        ];
      };
      xero_webhook_events: {
        Row: {
          event_id: string;
          platform_tenant_id: string;
          resource_type: string | null;
          resource_id: string | null;
          xero_tenant_id: string;
          event_type: string | null;
          event_date_utc: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          event_id: string;
          platform_tenant_id: string;
          resource_type?: string | null;
          resource_id?: string | null;
          xero_tenant_id: string;
          event_type?: string | null;
          event_date_utc?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          event_id?: string;
          platform_tenant_id?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          xero_tenant_id?: string;
          event_type?: string | null;
          event_date_utc?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "xero_webhook_events_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xero_webhook_events_platform_tenant_id_xero_tenant_id_fkey";
            columns: ["platform_tenant_id", "xero_tenant_id"];
            isOneToOne: false;
            referencedRelation: "xero_connections";
            referencedColumns: ["platform_tenant_id", "xero_tenant_id"];
          },
        ];
      };
      platform_tenant_members: {
        Row: {
          platform_tenant_id: string;
          user_id: string;
          role: "admin" | "bookkeeper" | "viewer";
          created_at: string;
        };
        Insert: {
          platform_tenant_id: string;
          user_id: string;
          role: "admin" | "bookkeeper" | "viewer";
          created_at?: string;
        };
        Update: {
          platform_tenant_id?: string;
          user_id?: string;
          role?: "admin" | "bookkeeper" | "viewer";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_tenant_members_platform_tenant_id_fkey";
            columns: ["platform_tenant_id"];
            isOneToOne: false;
            referencedRelation: "platform_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_platform_tenant_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      ensure_user_platform_tenant: {
        Args: {
          p_user_id: string;
        };
        Returns: string;
      };
      is_platform_tenant_member: {
        Args: {
          p_platform_tenant_id: string;
        };
        Returns: boolean;
      };
      platform_tenant_slug_from_email: {
        Args: {
          p_email: string | null;
          p_user_id: string;
          p_position: number;
        };
        Returns: string;
      };
      set_current_tenant: {
        Args: {
          p_platform_tenant_id: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
