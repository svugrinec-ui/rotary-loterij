import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from './demo';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Publieke, alleen-lezen client (anon-key). Gebruik deze op publieke pagina's.
 * RLS zorgt dat hier alleen publieke data uit komt.
 */
export function publicClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken.');
  }
  return createClient(url, anonKey, { auth: { persistSession: false }, db: { schema: DB_SCHEMA } }) as unknown as SupabaseClient;
}

/**
 * Server-side client met de service-role key. Omzeilt RLS.
 * ALLEEN aanroepen vanuit server-code (API-routes) achter het commissie-wachtwoord.
 */
export function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: DB_SCHEMA } }) as unknown as SupabaseClient;
}
