import {readFile} from "node:fs/promises";
export async function isolatedDatabase(){
  const {PGlite}=await import(process.env.PGLITE_MODULE??"@electric-sql/pglite");
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    -- Only fixture snapshot hashing substitutes pgcrypto, unavailable in PGlite.
    create function extensions.digest(text,text) returns bytea language sql as 'select decode(md5($1),''hex'')';`);
  for(const file of ["202608220001_generated_story_billing.sql","202608220002_generation_worker_rpc.sql",
    "202608230001_generated_story_tts.sql","202608230002_fix_generation_digest_search_path.sql","202611060001_edge_generation_worker.sql",
    "202611060002_generation_readiness.sql"]){
    const sql=await readFile(new URL(`../../../supabase/migrations/${file}`,import.meta.url),"utf8");
    await db.exec(sql.replace("create extension if not exists pgcrypto;",""));
  }
  return db;
}
