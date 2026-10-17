import 'dotenv/config'
import { createClient } from "@supabase/supabase-js";

if(!process.env.SUPABASE_URL || !process.env.DB_KEY){
    throw new Error('No db url or db key in .env');
}

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.DB_KEY
)

// Admin client bypasses RLS — use only for server-side Storage uploads
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase