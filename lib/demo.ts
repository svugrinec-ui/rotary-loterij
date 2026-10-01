// Testversie van de loterij (demo voor de verkoop). Aan met
// NEXT_PUBLIC_LOTERIJ_DEMO=1 én een eigen databaseschema (nooit 'public', zodat
// een demo nooit de echte loterijdata kan raken).
export const DB_SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public';
export const isDemo = process.env.NEXT_PUBLIC_LOTERIJ_DEMO === '1' && DB_SCHEMA !== 'public';
