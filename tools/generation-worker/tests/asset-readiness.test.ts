import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {isolatedDatabase} from './database.mjs';
const version='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a';
let db:Awaited<ReturnType<typeof isolatedDatabase>>;
before(async()=>{db=await isolatedDatabase({includeAssets:true});});after(async()=>db.close());
test('assets require independent operator verification and do not ready SQL dictionary',async()=>{
 await db.exec(`insert into public.generation_dictionary_versions(version,ready,expected_rows,sources) values('lex-244056cfff1d40670ec63f7b',false,892057,'[]');
 update public.generation_backend_status set active=true,consumer_verified=true,checked_at=now(),dictionary_version='${version}',capabilities='{"text_en":true,"text_zh":true,"audio_en":false,"audio_zh":false}'`);
 await assert.rejects(db.query("select public.ensure_generation_backend_ready('en','off')"),/unavailable/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.exec('update public.generation_asset_dictionaries set verified_at=now(),reader_version=gen_random_uuid()');}),/permission denied/);
 await db.exec('update public.generation_asset_dictionaries set verified_at=now(),reader_version=gen_random_uuid()');
 await db.query("select public.ensure_generation_backend_ready('en','off')");
 assert.equal((await db.query('select ready from public.generation_dictionary_versions')).rows[0].ready,false);
 await assert.rejects(db.query("select public.ensure_generation_backend_ready('en','every_scene')"),/unavailable/);
});
test('new checkpoint RPC rejects malformed progress without an owned live lease',async()=>{
 await assert.rejects(db.query('select public.edge_checkpoint_enrichment_step($1,$2,1,$3)',[crypto.randomUUID(),'fixture-owner',{}]),/fenced/);
 for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query('select public.edge_checkpoint_enrichment_step($1,$2,1,$3)',[crypto.randomUUID(),'fixture-owner',{}]);}),/permission denied/);
});
