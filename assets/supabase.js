// Supabase client for the bug-report pages.
//
// The URL and anon key are the same public client config the Zoovo app ships
// with (see codemagic.yaml in Zoovo-app/zoovo-app): the anon key is not a
// secret, and what it can do is limited by row-level security. Bug reports
// can only be filed through submit_bug_report() and only read by accounts in
// app_admins (migration 084_bug_reports.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

const SUPABASE_URL = 'https://bzoaterrltmuqedpikjv.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6b2F0ZXJybHRtdXFlZHBpa2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Mjg3MDAsImV4cCI6MjA4OTQwNDcwMH0.5VcxbzjF9tY2cjj41wSTNzrQM91lPQauLEcxeDt7zUg';

export function supabaseClient({ persistSession = false } = {}) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession, autoRefreshToken: persistSession },
  });
}
