"""Offline packaging of the existing verified CSV; no network or database access."""
import argparse,csv,hashlib,json,struct,shutil
from pathlib import Path
CSV_SHA='f92175fafb68d1dca3c9c7c1b3f9015ae97768786ec4b4af3c6d9781fb65bb1d'
def bucket(word):
 h=2166136261
 for b in word.encode():h=((h^b)*16777619)&0xffffffff
 return h%8192
def pack(source,out,licenses):
 assert not out.exists(),'Use a fresh output directory'
 required=['ECDICT-MIT.txt','CC-CEDICT-header.txt','ATTRIBUTION.txt']
 assert all((licenses/name).is_file() for name in required),'License material is required before publishing'
 assert 'MIT License' in (licenses/required[0]).read_text() and 'Attribution-ShareAlike 4.0' in (licenses/required[1]).read_text()
 raw=source/'entries.csv';assert hashlib.sha256(raw.read_bytes()).hexdigest()==CSV_SHA
 manifest=json.loads((source/'manifest.json').read_text());version=manifest['version']
 shards={(lang,i):{} for lang in ('zh','en') for i in range(8192)};counts={'zh':0,'en':0}
 with raw.open(newline='') as f:
  for row in csv.DictReader(f):
   assert row['version']==version and row['language'] in counts
   word=row['word'];data=shards[row['language'],bucket(word)];assert word not in data
   data[word]=[row['reading'] or None,json.loads(row['candidates']),row['level'] or None];counts[row['language']]+=1
 assert counts==manifest['rows_by_language'] and sum(counts.values())==892057
 root=out/version;root.mkdir(parents=True);files={}
 for (lang,i),entries in shards.items():
  name=f'{lang}/{i:04x}.json';p=root/name;p.parent.mkdir(exist_ok=True)
  content=json.dumps(entries,ensure_ascii=False,separators=(',',':')).encode();p.write_bytes(content)
  files[name]={'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content),'rows':len(entries)}
 catalog=b''.join(bytes.fromhex(files[f'{lang}/{i:04x}.json']['sha256'])+struct.pack('<II',files[f'{lang}/{i:04x}.json']['bytes'],files[f'{lang}/{i:04x}.json']['rows']) for lang in ('zh','en') for i in range(8192))
 (root/'catalog.bin').write_bytes(catalog)
 result={'format':'inkquest-assets-v1','version':version,'csvSha256':CSV_SHA,'rows':892057,'counts':counts,'buckets':8192,'hash':'fnv1a-utf8-u32','sources':manifest['sources'],'files':16384,'catalogSha256':hashlib.sha256(catalog).hexdigest()}
 (root/'licenses').mkdir()
 for name in required:shutil.copyfile(licenses/name,root/'licenses'/name)
 result['licenses']={name:hashlib.sha256((root/'licenses'/name).read_bytes()).hexdigest() for name in required}
 (out/'audit-manifest.json').write_text(json.dumps({'files':files},separators=(',',':')))
 content=json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode();(root/'manifest.json').write_bytes(content)
 summary={'version':version,'manifestSha256':hashlib.sha256(content).hexdigest(),'rows':892057,'files':len(files)+2+len(required),'totalBytes':sum(x['bytes'] for x in files.values()),'maxShardBytes':max(x['bytes'] for x in files.values())}
 (out/'build-report.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--licenses',type=Path,required=True);a=p.parse_args();pack(a.source,a.out,a.licenses)
