
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';

const supabaseUrl = config.SUPABASE_URL || '';
const supabaseAnonKey = config.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
