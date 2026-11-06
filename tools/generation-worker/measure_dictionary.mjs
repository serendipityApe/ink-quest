// Local PostgreSQL size measurement only. No credentials, network or upload.
import {readFile} from "node:fs/promises";
const {PGlite}=await import(process.env.PGLITE_MODULE??"@electric-sql/pglite");
const directory=process.argv[2];
if(!directory)throw new Error("Pass the directory produced by prepare_dictionary.py");
const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,"utf8"));
const db=new PGlite();
try{
  await db.exec(`create table entries(version text not null,language text not null,word text not null,
    reading text,candidates jsonb not null,level text,primary key(version,language,word));`);
  console.log("Loading prepared public lexical data into isolated local PostgreSQL...");
  await db.exec("copy entries from '/dev/blob' with(format csv,header true)",{blob:new Blob([await readFile(`${directory}/entries.csv`)])});
  await db.exec("analyze entries");
  const row=(await db.query(`select count(*)::integer rows,pg_relation_size('entries') heap_bytes,
    pg_indexes_size('entries') index_bytes,pg_total_relation_size('entries') total_bytes from entries`)).rows[0];
  if(row.rows!==manifest.expected_rows)throw new Error("Prepared row count mismatch");
  console.log(JSON.stringify({version:manifest.version,...row,
    note:"Local PGlite PostgreSQL physical allocation, not the current Supabase usage; retain migration/WAL/free-capacity margin."},null,2));
}finally{await db.close();}
