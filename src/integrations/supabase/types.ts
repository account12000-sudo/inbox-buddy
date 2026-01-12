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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          body: string
          created_at: string
          id: string
          interval_seconds: number
          name: string
          sent_count: number
          status: string
          subject: string
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          interval_seconds?: number
          name: string
          sent_count?: number
          status?: string
          subject: string
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          interval_seconds?: number
          name?: string
          sent_count?: number
          status?: string
          subject?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          recipient_email: string
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          recipient_email: string
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          recipient_email?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sent_emails: {
        Row: {
          campaign_id: string | null
          clicked_at: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          tracking_token: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          clicked_at?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
          tracking_token?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          clicked_at?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          tracking_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          link_url: string | null
          sent_email_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          sent_email_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          sent_email_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_sent_email_id_fkey"
            columns: ["sent_email_id"]
            isOneToOne: false
            referencedRelation: "sent_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      user_smtp_settings: {
        Row: {
          created_at: string
          encryption: string
          from_email: string
          from_name: string | null
          host: string
          id: string
          password: string
          port: number
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          encryption?: string
          from_email: string
          from_name?: string | null
          host: string
          id?: string
          password: string
          port?: number
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          encryption?: string
          from_email?: string
          from_name?: string | null
          host?: string
          id?: string
          password?: string
          port?: number
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
