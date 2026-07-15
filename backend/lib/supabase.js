const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', supabaseUrl ? 'loaded' : 'MISSING');
console.log('SUPABASE_ANON_KEY:', supabaseKey ? 'loaded' : 'MISSING');

if (!supabaseUrl || !supabaseKey) {
  throw new Error(`Missing Supabase credentials. URL: ${supabaseUrl ? 'ok' : 'missing'}, KEY: ${supabaseKey ? 'ok' : 'missing'}`);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;