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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability: {
        Row: {
          couple_id: string
          created_at: string | null
          date: string
          id: string
          part: string
          status: string | null
          user_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          date: string
          id?: string
          part: string
          status?: string | null
          user_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          date?: string
          id?: string
          part?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          banner_focus: number
          banner_url: string | null
          created_at: string | null
          currency: string
          dashboard_layout: Json | null
          id: string
          invite_code: string | null
          lifetime_at: string | null
          priority_todo_list_id: string | null
          shared_note: string | null
          started_at: string | null
        }
        Insert: {
          banner_focus?: number
          banner_url?: string | null
          created_at?: string | null
          currency?: string
          dashboard_layout?: Json | null
          id?: string
          invite_code?: string | null
          priority_todo_list_id?: string | null
          shared_note?: string | null
          started_at?: string | null
        }
        Update: {
          banner_focus?: number
          banner_url?: string | null
          created_at?: string | null
          currency?: string
          dashboard_layout?: Json | null
          id?: string
          invite_code?: string | null
          priority_todo_list_id?: string | null
          shared_note?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couples_priority_todo_list_id_fkey"
            columns: ["priority_todo_list_id"]
            isOneToOne: false
            referencedRelation: "vault_todo_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_moments: {
        Row: {
          archived_at: string | null
          couple_id: string
          created_at: string | null
          id: string
          moment_date: string
          prompt_id: string
        }
        Insert: {
          archived_at?: string | null
          couple_id: string
          created_at?: string | null
          id?: string
          moment_date: string
          prompt_id: string
        }
        Update: {
          archived_at?: string | null
          couple_id?: string
          created_at?: string | null
          id?: string
          moment_date?: string
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_moments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_moments_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "daily_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_prompts: {
        Row: {
          active: boolean
          body: string
          created_at: string | null
          id: string
          intimacy: number
          kind: string
          min_shared_count: number
          options: Json | null
          tags: string[]
          weight: number
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string | null
          id?: string
          intimacy?: number
          kind: string
          min_shared_count?: number
          options?: Json | null
          tags?: string[]
          weight?: number
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string | null
          id?: string
          intimacy?: number
          kind?: string
          min_shared_count?: number
          options?: Json | null
          tags?: string[]
          weight?: number
        }
        Relationships: []
      }
      daily_responses: {
        Row: {
          body: string
          couple_id: string
          created_at: string | null
          id: string
          moment_id: string
          option_choice: string | null
          user_id: string
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string | null
          id?: string
          moment_id: string
          option_choice?: string | null
          user_id: string
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string | null
          id?: string
          moment_id?: string
          option_choice?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_responses_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_responses_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "daily_moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendee: string | null
          colour_tag: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          emoji: string | null
          id: string
          on_date: string
          parts: string[]
          start_time: string | null
          title: string
          until_date: string | null
        }
        Insert: {
          attendee?: string | null
          colour_tag?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          emoji?: string | null
          id?: string
          on_date: string
          parts?: string[]
          start_time?: string | null
          title: string
          until_date?: string | null
        }
        Update: {
          attendee?: string | null
          colour_tag?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          emoji?: string | null
          id?: string
          on_date?: string
          parts?: string[]
          start_time?: string | null
          title?: string
          until_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_attendee_fkey"
            columns: ["attendee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          currency: string | null
          id: string
          paid_by: string
          settled: boolean | null
          split_ratio: number | null
          title: string
        }
        Insert: {
          amount: number
          category?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          currency?: string | null
          id?: string
          paid_by: string
          settled?: boolean | null
          split_ratio?: number | null
          title: string
        }
        Update: {
          amount?: number
          category?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          currency?: string | null
          id?: string
          paid_by?: string
          settled?: boolean | null
          split_ratio?: number | null
          title?: string
        }
        Relationships: []
      }
      join_attempts: {
        Row: {
          attempted_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          amount: number
          category: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          id: string
          paid_by: string
          recurrence: string
          settled: boolean | null
          settled_at: string | null
          split_ratio: number | null
          title: string
        }
        Insert: {
          amount: number
          category?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          id?: string
          paid_by: string
          recurrence?: string
          settled?: boolean | null
          settled_at?: string | null
          split_ratio?: number | null
          title: string
        }
        Update: {
          amount?: number
          category?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          paid_by?: string
          recurrence?: string
          settled?: boolean | null
          settled_at?: string | null
          split_ratio?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          checkin_date: string
          couple_id: string
          created_at: string | null
          id: string
          mood_score: number
          note: string | null
          user_id: string
        }
        Insert: {
          checkin_date?: string
          couple_id: string
          created_at?: string | null
          id?: string
          mood_score: number
          note?: string | null
          user_id: string
        }
        Update: {
          checkin_date?: string
          couple_id?: string
          created_at?: string | null
          id?: string
          mood_score?: number
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      note_items: {
        Row: {
          body: string
          couple_id: string
          created_at: string | null
          created_by: string
          id: string
          sort_order: number
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string | null
          created_by: string
          id?: string
          sort_order?: number
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          id: string
          pinned: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          id?: string
          pinned?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          pinned?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pot_folders: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string
          emoji: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by: string
          emoji?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string
          emoji?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pot_folders_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pot_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string | null
          activity_at: Json | null
          avatar_url: string | null
          couple_id: string | null
          created_at: string | null
          current_mood: number | null
          display_name: string | null
          id: string
          mood_updated_at: string | null
          role: string | null
        }
        Insert: {
          accent_color?: string | null
          activity_at?: Json | null
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string | null
          current_mood?: number | null
          display_name?: string | null
          id: string
          mood_updated_at?: string | null
          role?: string | null
        }
        Update: {
          accent_color?: string | null
          activity_at?: Json | null
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string | null
          current_mood?: number | null
          display_name?: string | null
          id?: string
          mood_updated_at?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          last_notified_at: string | null
          nudge_count: number
          nudge_date: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          last_notified_at?: string | null
          nudge_count?: number
          nudge_date?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          last_notified_at?: string | null
          nudge_count?: number
          nudge_date?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_pots: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string | null
          currency: string
          emoji: string | null
          folder_id: string | null
          goal_amount: number
          hers_amount: number | null
          his_amount: number | null
          id: string
          pinned: boolean
          target_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          emoji?: string | null
          folder_id?: string | null
          goal_amount: number
          hers_amount?: number | null
          his_amount?: number | null
          id?: string
          pinned?: boolean
          target_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          emoji?: string | null
          folder_id?: string | null
          goal_amount?: number
          hers_amount?: number | null
          his_amount?: number | null
          id?: string
          pinned?: boolean
          target_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_pots_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_pots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_pots_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "pot_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      sounding_board: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string
          id: string
          note: string | null
          og_image: string | null
          og_title: string | null
          reaction: string | null
          url: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by: string
          id?: string
          note?: string | null
          og_image?: string | null
          og_title?: string | null
          reaction?: string | null
          url?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          note?: string | null
          og_image?: string | null
          og_title?: string | null
          reaction?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sounding_board_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounding_board_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean | null
          completed_at: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          due_date: string | null
          id: string
          notes: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          due_date?: string | null
          id?: string
          notes?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          title?: string
        }
        Relationships: []
      }
      vault_albums: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_albums_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_albums_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_folders: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string
          emoji: string
          id: string
          is_default: boolean
          kind: string
          name: string
          sort_order: number
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by: string
          emoji?: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          sort_order?: number
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string
          emoji?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_folders_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_items: {
        Row: {
          bought_by: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          folder_id: string | null
          id: string
          item_emoji: string | null
          notes: string | null
          og_image: string | null
          og_title: string | null
          owner: string | null
          price_range: string | null
          stage: string | null
          tags: string[] | null
          title: string
          type: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          bought_by?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          folder_id?: string | null
          id?: string
          item_emoji?: string | null
          notes?: string | null
          og_image?: string | null
          og_title?: string | null
          owner?: string | null
          price_range?: string | null
          stage?: string | null
          tags?: string[] | null
          title: string
          type: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          bought_by?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          folder_id?: string | null
          id?: string
          item_emoji?: string | null
          notes?: string | null
          og_image?: string | null
          og_title?: string | null
          owner?: string | null
          price_range?: string | null
          stage?: string | null
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_items_bought_by_fkey"
            columns: ["bought_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "vault_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_photos: {
        Row: {
          album_id: string | null
          archived_at: string | null
          caption: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          favorite: boolean
          height: number
          id: string
          path: string
          width: number
        }
        Insert: {
          album_id?: string | null
          archived_at?: string | null
          caption?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          favorite?: boolean
          height?: number
          id?: string
          path: string
          width?: number
        }
        Update: {
          album_id?: string | null
          archived_at?: string | null
          caption?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          favorite?: boolean
          height?: number
          id?: string
          path?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_photos_album_fk"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "vault_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_photos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_todo_lists: {
        Row: {
          couple_id: string
          created_at: string | null
          created_by: string
          emoji: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          created_by: string
          emoji?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          created_by?: string
          emoji?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_todo_lists_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_todo_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_todos: {
        Row: {
          assignee: string | null
          couple_id: string
          created_at: string | null
          created_by: string
          done: boolean
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          last_reminded: string | null
          list_id: string
          needs_both: boolean
          notes: string | null
          parent_id: string | null
          position: number
          recurrence: string
          remind: boolean
          ticked_by: string[]
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          couple_id: string
          created_at?: string | null
          created_by: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          last_reminded?: string | null
          list_id: string
          needs_both?: boolean
          notes?: string | null
          parent_id?: string | null
          position?: number
          recurrence?: string
          remind?: boolean
          ticked_by?: string[]
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          last_reminded?: string | null
          list_id?: string
          needs_both?: boolean
          notes?: string | null
          parent_id?: string | null
          position?: number
          recurrence?: string
          remind?: boolean
          ticked_by?: string[]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_todos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_todos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_todos_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_todos_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vault_todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_todos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vault_todos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mood_reveal: {
        Row: {
          checkin_date: string | null
          couple_id: string | null
          mood_score: number | null
          note: string | null
          user_id: string | null
        }
        Insert: {
          checkin_date?: string | null
          couple_id?: string | null
          mood_score?: number | null
          note?: string | null
          user_id?: string | null
        }
        Update: {
          checkin_date?: string | null
          couple_id?: string | null
          mood_score?: number | null
          note?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      clear_couple_availability: {
        Args: { p_couple_id: string; p_date: string; p_part: string }
        Returns: undefined
      }
      create_couple_for_user: { Args: { p_user_id: string }; Returns: string }
      daily_build: {
        Args: {
          p_caller: string
          p_couple: string
          p_day_key: string
          p_partner: string
        }
        Returns: Json
      }
      daily_pick_prompt: {
        Args: { p_couple_id: string; p_day_key: string }
        Returns: string
      }
      daily_shared_count: { Args: { p_couple_id: string }; Returns: number }
      get_daily: { Args: { p_day_key: string }; Returns: Json }
      get_daily_history: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      get_home_data: { Args: { p_user_id: string }; Returns: Json }
      get_my_profile: { Args: { p_user_id: string }; Returns: Json }
      get_partner_profile: {
        Args: { p_couple_id: string; p_my_id: string }
        Returns: Json
      }
      get_partner_push_subscription: {
        Args: { p_couple_id: string; p_my_id: string }
        Returns: Json
      }
      get_session_data: { Args: { p_user_id: string }; Returns: Json }
      is_couple_member: { Args: { target_couple_id: string }; Returns: boolean }
      claim_lifetime: { Args: { p_couple_id: string }; Returns: boolean }
      lifetime_spots_remaining: { Args: Record<string, never>; Returns: number }
      free_history_cutoff: { Args: { p_couple_id: string }; Returns: string }
      grant_couple_trial: { Args: { p_couple_id: string }; Returns: undefined }
      join_couple_for_user: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      leave_couple_for_user: { Args: { p_user_id: string }; Returns: undefined }
      pending_join_request: { Args: { p_couple_id: string }; Returns: Json }
      request_join_couple: {
        Args: { p_code: string; p_user_id: string }
        Returns: Json
      }
      respond_join_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: string
      }
      mark_section_activity: {
        Args: { p_section: string; p_user_id: string }
        Returns: undefined
      }
      my_couple_id: { Args: never; Returns: string }
      redeem_beta_code: { Args: { p_code: string }; Returns: string }
      save_push_subscription: {
        Args: { p_couple_id: string; p_subscription: Json; p_user_id: string }
        Returns: undefined
      }
      set_availability: {
        Args: {
          p_couple_id: string
          p_date: string
          p_free: boolean
          p_part: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_availability_day: {
        Args: {
          p_couple_id: string
          p_date: string
          p_free: boolean
          p_user_id: string
        }
        Returns: undefined
      }
      set_dashboard_layout: {
        Args: { p_couple_id: string; p_layout: Json }
        Returns: undefined
      }
      set_priority_todo_list: {
        Args: { p_couple_id: string; p_list_id: string }
        Returns: undefined
      }
      submit_daily_response: {
        Args: { p_body: string; p_day_key: string; p_option: string }
        Returns: Json
      }
      toggle_todo_tick: {
        Args: { p_couple_id: string; p_id: string }
        Returns: Json
      }
      update_couple_banner: {
        Args: { p_couple_id: string; p_url: string; p_user_id: string }
        Returns: undefined
      }
      update_couple_banner_focus: {
        Args: { p_couple_id: string; p_focus: number; p_user_id: string }
        Returns: undefined
      }
      update_couple_currency: {
        Args: { p_couple_id: string; p_currency: string; p_user_id: string }
        Returns: undefined
      }
      update_couple_started_at: {
        Args: { p_couple_id: string; p_date: string; p_user_id: string }
        Returns: undefined
      }
      update_my_accent_color: {
        Args: { p_color: string; p_user_id: string }
        Returns: undefined
      }
      update_my_avatar: {
        Args: { p_url: string; p_user_id: string }
        Returns: undefined
      }
      update_my_display_name: {
        Args: { p_name: string; p_user_id: string }
        Returns: undefined
      }
      update_my_mood: {
        Args: { p_mood: number; p_user_id: string }
        Returns: undefined
      }
      update_shared_note: {
        Args: { p_couple_id: string; p_note: string; p_user_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
