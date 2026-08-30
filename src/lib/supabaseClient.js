import { createClient } from "@supabase/supabase-js";

// Estos dos valores son públicos por diseño (están pensados para ir dentro
// del código que se envía al navegador, igual que hace la propia app de
// Supabase). Lo que de verdad protege tus datos son las políticas de RLS
// (Row Level Security) que configuraremos en el paso de seguridad/login.
const SUPABASE_URL = "https://cgdrdqjvtrpjoigwiddb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kGNmam0Y4Y463FYstTAsow_EyOW7Hh5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
