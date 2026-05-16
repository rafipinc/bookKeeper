function missingEnv(name: string): never {
  throw new Error(`Missing env var: ${name}`);
}

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? missingEnv("NEXT_PUBLIC_SUPABASE_URL");

export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? missingEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
