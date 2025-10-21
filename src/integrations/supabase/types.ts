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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      daily_summaries: {
        Row: {
          created_at: string
          id: string
          location_id: string
          revenue: number | null
          summary_date: string
          total_incoming: number | null
          total_returns: number | null
          total_sales: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          revenue?: number | null
          summary_date?: string
          total_incoming?: number | null
          total_returns?: number | null
          total_sales?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          revenue?: number | null
          summary_date?: string
          total_incoming?: number | null
          total_returns?: number | null
          total_sales?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_summaries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          created_at: string
          error_message: string | null
          file_path: string
          file_size: number | null
          filename: string
          id: string
          processed_records: number | null
          status: string | null
          updated_at: string
          upload_date: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_path: string
          file_size?: number | null
          filename: string
          id?: string
          processed_records?: number | null
          status?: string | null
          updated_at?: string
          upload_date?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_path?: string
          file_size?: number | null
          filename?: string
          id?: string
          processed_records?: number | null
          status?: string | null
          updated_at?: string
          upload_date?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      phone_models: {
        Row: {
          brand: string
          color: string | null
          created_at: string
          id: string
          model: string
          srp: number | null
          storage_capacity: string | null
          updated_at: string
        }
        Insert: {
          brand: string
          color?: string | null
          created_at?: string
          id?: string
          model: string
          srp?: number | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          color?: string | null
          created_at?: string
          id?: string
          model?: string
          srp?: number | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      phones: {
        Row: {
          brand: string
          color: string | null
          created_at: string
          id: string
          model: string
          price: number | null
          storage_capacity: string | null
          updated_at: string
        }
        Insert: {
          brand: string
          color?: string | null
          created_at?: string
          id?: string
          model: string
          price?: number | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          color?: string | null
          created_at?: string
          id?: string
          model?: string
          price?: number | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_entries: {
        Row: {
          add_stock: number
          adjustment: number
          cost_price: number | null
          created_at: string
          date: string
          id: string
          imei: string | null
          incoming: number
          location_id: string
          morning_stock: number
          night_stock: number
          notes: string | null
          phone_model_id: string
          profit_loss: number | null
          returns: number
          sale_date: string | null
          selling_price: number | null
          sold: number
          updated_at: string
        }
        Insert: {
          add_stock?: number
          adjustment?: number
          cost_price?: number | null
          created_at?: string
          date?: string
          id?: string
          imei?: string | null
          incoming?: number
          location_id: string
          morning_stock?: number
          night_stock?: number
          notes?: string | null
          phone_model_id: string
          profit_loss?: number | null
          returns?: number
          sale_date?: string | null
          selling_price?: number | null
          sold?: number
          updated_at?: string
        }
        Update: {
          add_stock?: number
          adjustment?: number
          cost_price?: number | null
          created_at?: string
          date?: string
          id?: string
          imei?: string | null
          incoming?: number
          location_id?: string
          morning_stock?: number
          night_stock?: number
          notes?: string | null
          phone_model_id?: string
          profit_loss?: number | null
          returns?: number
          sale_date?: string | null
          selling_price?: number | null
          sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_phone_model_id_fkey"
            columns: ["phone_model_id"]
            isOneToOne: false
            referencedRelation: "phone_models"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_events: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          event_type: string
          id: number
          imei: string
          location_id: string
          metadata: Json
          notes: string | null
          phone_model_id: string
          qty: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          event_type: string
          id?: number
          imei: string
          location_id: string
          metadata?: Json
          notes?: string | null
          phone_model_id: string
          qty?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          event_type?: string
          id?: number
          imei?: string
          location_id?: string
          metadata?: Json
          notes?: string | null
          phone_model_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_events_phone_model_id_fkey"
            columns: ["phone_model_id"]
            isOneToOne: false
            referencedRelation: "phone_models"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          phone_id: string
          quantity: number
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          phone_id: string
          quantity: number
          transaction_date?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          phone_id?: string
          quantity?: number
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "phones"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions_log: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_night_stock: number
          notes: string | null
          previous_night_stock: number
          quantity: number
          stock_entry_id: string
          transaction_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_night_stock: number
          notes?: string | null
          previous_night_stock: number
          quantity: number
          stock_entry_id: string
          transaction_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_night_stock?: number
          notes?: string | null
          previous_night_stock?: number
          quantity?: number
          stock_entry_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_log_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "stock_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_insert_stock: {
        Args: { entries: Json[] }
        Returns: undefined
      }
      calculate_night_stock: {
        Args: {
          p_add_stock: number
          p_adjustment: number
          p_incoming: number
          p_morning_stock: number
          p_returns: number
          p_sold: number
        }
        Returns: number
      }
      cascade_recalc_stock: {
        Args:
          | {
              p_from_date: string
              p_imei: string
              p_location_id: string
              p_phone_model_id: string
            }
          | {
              p_from_date: string
              p_location_id?: string
              p_phone_model_id?: string
              p_to_date?: string
            }
        Returns: {
          affected_entries: number
          recalculated_days: number
        }[]
      }
      cascade_recalc_stock_simple: {
        Args: {
          p_date: string
          p_location_id: string
          p_phone_model_id: string
        }
        Returns: undefined
      }
      cascade_recalc_stock_with_imei: {
        Args: {
          p_from_date: string
          p_imei?: string
          p_location_id?: string
          p_phone_model_id?: string
          p_to_date?: string
        }
        Returns: {
          affected_entries: number
          recalculated_days: number
        }[]
      }
      check_and_rollover_if_needed: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      delete_brand: {
        Args: { brand_name: string }
        Returns: undefined
      }
      delete_stock_entry_and_logs: {
        Args: { entry_id: string }
        Returns: undefined
      }
      fix_rollover_issues: {
        Args: { p_from_date?: string; p_to_date?: string }
        Returns: {
          fixed_entries: number
        }[]
      }
      rebuild_stock_entries_from_events: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      recalculate_stock_range: {
        Args: { p_from_date: string; p_to_date?: string }
        Returns: undefined
      }
      reset_all_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      rollover_to_new_day: {
        Args: { target_date: string }
        Returns: undefined
      }
      update_brand_name: {
        Args: { new_brand_name: string; old_brand_name: string }
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
