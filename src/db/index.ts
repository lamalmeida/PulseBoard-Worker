import { createClient } from "@supabase/supabase-js";
import { Database } from "../../database.types";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});