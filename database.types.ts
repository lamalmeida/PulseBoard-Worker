export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      endpoints: {
        Row: {
          id: string
          user_id: string
          name: string
          url: string
          check_interval: number
          is_active: boolean
          created_at: string
          updated_at: string
          last_notification_sent_at: string | null
          last_failure_status: string | null
          consecutive_failures_threshold: number
          send_recovery_notifications: boolean
          escalation_interval_seconds: number
          notification_cooldown_seconds: number
          slug: string
          is_public: boolean
          public_title: string | null
          public_description: string | null
          next_check_at: string | null
          http_method: string
          request_headers: Json | null
          request_body: string | null
          timeout_sec: number
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          url: string
          check_interval?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          last_notification_sent_at?: string | null
          last_failure_status?: string | null
          consecutive_failures_threshold?: number
          send_recovery_notifications?: boolean
          escalation_interval_seconds?: number
          notification_cooldown_seconds?: number
          slug?: string
          is_public?: boolean
          public_title?: string | null
          public_description?: string | null
          next_check_at?: string | null
          http_method?: string
          request_headers?: Json | null
          request_body?: string | null
          timeout_sec?: number
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          url?: string
          check_interval?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          last_notification_sent_at?: string | null
          last_failure_status?: string | null
          consecutive_failures_threshold?: number
          send_recovery_notifications?: boolean
          escalation_interval_seconds?: number
          notification_cooldown_seconds?: number
          slug?: string
          is_public?: boolean
          public_title?: string | null
          public_description?: string | null
          next_check_at?: string | null
          http_method?: string
          request_headers?: Json | null
          request_body?: string | null
          timeout_sec?: number
        }
      }
      checks: {
        Row: {
          id: string
          checked_at: string
          endpoint_id: string
          status: string
          status_code: number
          response_time: number
          error_message: string | null
          num_checks: number
        }
        Insert: {
          id?: string
          checked_at: string
          endpoint_id: string
          status: string
          status_code: number
          response_time: number
          error_message?: string | null
          num_checks?: number
        }
        Update: {
          id?: string
          checked_at?: string
          endpoint_id?: string
          status?: string
          status_code?: number
          response_time?: number
          error_message?: string | null
          num_checks?: number
        }
      }
      notifications: {
        Row: {
          id: string
          sent_at: string
          endpoint_id: string
          notification_type: string
          recipient_email: string
          escalation_count: number
          incident_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          endpoint_id: string
          notification_type: string
          recipient_email: string
          escalation_count?: number
          incident_id?: string
        }
        Update: {
          id?: string
          sent_at?: string
          endpoint_id?: string
          notification_type?: string
          recipient_email?: string
          escalation_count?: number
          incident_id?: string
        }
      }
      status_pages: {
        Row: {
          id: string
          user_id: string
          title: string
          slug: string
          description: string | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          slug: string
          description?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          slug?: string
          description?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      status_page_endpoints: {
        Row: {
          status_page_id: string
          endpoint_id: string
        }
        Insert: {
          status_page_id: string
          endpoint_id: string
        }
        Update: {
          status_page_id?: string
          endpoint_id?: string
        }
      }
    }
  }
}
