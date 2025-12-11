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
          created_at: string
          user_id: string
          url: string
          name: string
          is_active: boolean
          check_interval: number
          consecutive_failures_threshold: number
          notification_cooldown_seconds: number
          send_recovery_notifications: boolean
          next_check_at: string | null
          last_check_at: string | null
          http_method: string
          request_headers: Json | null
          request_body: string | null
          timeout_sec: number
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          url: string
          name: string
          is_active?: boolean
          check_interval?: number
          consecutive_failures_threshold?: number
          notification_cooldown_seconds?: number
          send_recovery_notifications?: boolean
          next_check_at?: string | null
          last_check_at?: string | null
          http_method?: string
          request_headers?: Json | null
          request_body?: string | null
          timeout_sec?: number
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          url?: string
          name?: string
          is_active?: boolean
          check_interval?: number
          consecutive_failures_threshold?: number
          notification_cooldown_seconds?: number
          send_recovery_notifications?: boolean
          next_check_at?: string | null
          last_check_at?: string | null
          http_method?: string
          request_headers?: Json | null
          request_body?: string | null
          timeout_sec?: number
        }
      }
      checks: {
        Row: {
          id: string
          created_at: string
          endpoint_id: string
          status: string
          status_code: number
          response_time: number
          error_message: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          endpoint_id: string
          status: string
          status_code: number
          response_time: number
          error_message?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          endpoint_id?: string
          status?: string
          status_code?: number
          response_time?: number
          error_message?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          created_at: string
          endpoint_id: string
          notification_type: string
          recipient_email: string
          sent_at: string
        }
        Insert: {
          id?: string
          created_at?: string
          endpoint_id: string
          notification_type: string
          recipient_email: string
          sent_at?: string
        }
        Update: {
          id?: string
          created_at?: string
          endpoint_id?: string
          notification_type?: string
          recipient_email?: string
          sent_at?: string
        }
      }
    }
  }
}
