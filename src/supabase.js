import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://mriqohudbvptulimqqmd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yaXFvaHVkYnZwdHVsaW1xcW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjE4ODQsImV4cCI6MjA5NzAzNzg4NH0.xZcCWQNWJx8cJQiQx6wiLka_AuK4gz59QQjzLbB592A',
)
