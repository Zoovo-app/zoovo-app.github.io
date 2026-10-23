// Supabase client for the bug-report and review pages.
//
// The URL and anon key are the same public client config the Zoovo app ships
// with (see codemagic.yaml in Zoovo-app/zoovo-app): the anon key is not a
// secret, and what it can do is limited by row-level security. Bug reports
// can only be filed through submit_bug_report() and only read by accounts in
// app_admins (migration 084_bug_reports.sql).
//
// supabase-js is served from this site, not from a CDN. Each page loads
// /assets/vendor/supabase-js-2.117.3.js with its integrity
// (sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R)
// before this module runs, and the bundle sets the global `supabase`. The file
// is the release's dist/umd/supabase.js, byte for byte, from
// `npm pack @supabase/supabase-js@2.117.3` (tarball integrity
// sha512-K+f8PimXDunPWQ63CKRXaF5pbVPJxmfw5ryAnh0s9S9PkwcuqBjiSpIaqpF7KLDljeYwXIL85ST8QxaO0+XuvA==).
// To update it, vendor the new release the same way, then change the file
// name and the integrity on every page that loads it (grep for supabase-js-).

const SUPABASE_URL = 'https://bzoaterrltmuqedpikjv.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6b2F0ZXJybHRtdXFlZHBpa2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Mjg3MDAsImV4cCI6MjA4OTQwNDcwMH0.5VcxbzjF9tY2cjj41wSTNzrQM91lPQauLEcxeDt7zUg';

// persistSession: the team's pages keep the signed-in session, in
// sessionStorage: it lasts as long as the tab, and no other page of this
// shared origin finds it in localStorage. A session is never handed to a page
// inside a frame (frame-guard.js has blanked such a page already; this is the
// second line). Without persistSession (the public bug form) nothing is stored.
export function supabaseClient({ persistSession = false } = {}) {
  const lib = globalThis.supabase;
  if (typeof lib?.createClient !== 'function') {
    throw new Error('supabase-js did not load: the page must load the vendored script before this module.');
  }
  if (persistSession && window.top !== window.self) {
    throw new Error('This page does not run inside a frame.');
  }
  return lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession,
      autoRefreshToken: persistSession,
      ...(persistSession ? { storage: window.sessionStorage } : {}),
    },
  });
}
