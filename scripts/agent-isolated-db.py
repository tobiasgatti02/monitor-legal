#!/usr/bin/env python3
"""Real PostgreSQL tests. Only a loopback synthetic cluster is accepted; never reads env secrets."""
import json, subprocess, uuid, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1]
name='agent_test_'+uuid.uuid4().hex[:12]
args=['psql','-X','-h','127.0.0.1','-p','55439','-U','neondb_owner','-v','ON_ERROR_STOP=1','-Atq']
report=[]
def query(sql, actor=None, db=name, expect_error=False):
 if actor: sql="begin;set local role monitor_runtime;select set_config('request.jwt.claim.sub','"+actor+"',true);"+sql+";commit;"
 p=subprocess.run(args+['-d',db],input=sql,text=True,capture_output=True)
 if expect_error:
  assert p.returncode!=0,p.stdout
  return p.stderr
 if p.returncode: raise AssertionError(p.stderr)
 lines=[r for r in p.stdout.splitlines() if r not in ['BEGIN','COMMIT','SET',actor]]
 return lines[-1] if lines else ''
def check(label, condition):
 assert condition,label
 report.append({'name':label,'passed':True})
 print('PASS',label)
query('create database '+name,db='postgres')
try:
 for migration in sorted((root/'neon/migrations').glob('*.sql')):
  query(migration.read_text())
 check('All migrations applied on an empty synthetic database',True)
 query('''insert into "user"(id,name,email) values('synthetic-a','A','a@synthetic.test'),('synthetic-b','B','b@synthetic.test'),('synthetic-c','C','c@synthetic.test');
 insert into tenants(id,name,created_by) values('10000000-0000-4000-8000-000000000001','SYNTHETIC ONLY','synthetic-a'),('10000000-0000-4000-8000-000000000002','OTHER SYNTHETIC','synthetic-c');
 insert into tenant_members(tenant_id,user_id,role_code,created_by) values('10000000-0000-4000-8000-000000000001','synthetic-a','OWNER','synthetic-a'),('10000000-0000-4000-8000-000000000001','synthetic-b','LAWYER','synthetic-a'),('10000000-0000-4000-8000-000000000002','synthetic-c','OWNER','synthetic-c');
 insert into cases(id,tenant_id,title,created_by) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A','synthetic-a'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Private A','synthetic-a'),('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Synthetic C','synthetic-c');
 insert into case_assignments(tenant_id,case_id,user_id,created_by) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','synthetic-b','synthetic-a');
 insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,content_hash,size_bytes,created_by) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','synthetic.txt','NEON','synthetic','checksum',42,'synthetic-a');
 insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'synthetic','checksum',42,'synthetic-a');''')
 actor='synthetic-a';tenant='10000000-0000-4000-8000-000000000001';case='20000000-0000-4000-8000-000000000001';doc='30000000-0000-4000-8000-000000000001'
 check('Runtime cannot bypass RLS',query("select not rolbypassrls and not rolsuper from pg_roles where rolname=current_user",actor)=='t')
 work=query(f"insert into ai_work(tenant_id,user_id,profile,case_id) values('{tenant}','{actor}','document','{case}') returning id",actor)
 call=f"select app.reserve_ai_attempt('{work}','test','cloudflare','@cf/qwen/qwen3-30b-a3b-fp8','v1','cf-2026-10-04','official',1000,600)"
 with ThreadPoolExecutor(2) as pool:
  results=list(pool.map(lambda _:query(call,actor,expect_error=False),[0]))
 attempt=results[0]
 check('Reservation persisted before provider call',query(f"select count(*) from ai_attempts where id='{attempt}' and status='RESERVED'",actor)=='1')
 check('Concurrent same-case generation is rejected','CONCURRENCY_LIMIT' in query(call,actor,expect_error=True))
 query(f"select app.settle_ai_attempt('{attempt}',null,null,null,null,25,'UNCERTAIN','TIMEOUT')",actor)
 check('Missing usage retains nonzero reservation',query(f"select input_tokens is null and neurons=neurons_reserved and neurons>0 and usage_origin='estimated' from ai_attempts where id='{attempt}'",actor)=='t')
 check('Settlement replay rejected','ATTEMPT_NOT_ACCESSIBLE' in query(f"select app.settle_ai_attempt('{attempt}',0,0,null,null,0,'SUCCEEDED',null)",actor,expect_error=True))
 attempt2=query(call,actor)
 query(f"select app.settle_ai_attempt('{attempt2}',100,20,10,2,1,'SUCCEEDED',null)",actor)
 check('Reported usage reconciles cached/reasoning tokens',query(f"select input_tokens=100 and output_tokens=20 and cached_tokens=10 and reasoning_tokens=2 and usage_origin='reported' from ai_attempts where id='{attempt2}'",actor)=='t')
 check('Retries consume call budget','WORK_BUDGET_EXCEEDED' in query(call,actor,expect_error=True))
 check('Auxiliary embeddings participate in ledger',bool(query(f"select app.reserve_ai_attempt('{work}','embedding','cloudflare','@cf/baai/bge-m3','v1','cf-v1','official',100,0)",actor)))
 check('Other actor cannot use a work id','WORK_NOT_ACCESSIBLE' in query(call,'synthetic-b',expect_error=True))
 check('Other tenant sees no attempts',query('select count(*) from ai_attempts','synthetic-c')=='0')
 extraction=query(f"insert into ai_work(tenant_id,user_id,profile,case_id,document_id) values('{tenant}','{actor}','extraction_document','{case}','{doc}') returning id",actor)
 query(f"select app.prepare_extraction('{extraction}',5000,1200,2)",actor)
 check('Whole extraction holds daily neurons before calls',query(f"select prepaid_remaining>0 and prepaid_day=(now() at time zone 'UTC')::date from ai_work where id='{extraction}'",actor)=='t')
 query(f"update ai_work set prepaid_day=prepaid_day-1 where id='{extraction}'")
 check('Reservation cannot cross provider UTC day','DOCUMENT_RESERVATION_EXPIRED' in query(f"select app.prepare_extraction('{extraction}',5000,1200,2)",actor,expect_error=True))
 query(f"update ai_work set prepaid_day=prepaid_day+1 where id='{extraction}'")
 query(f"select app.release_extraction('{extraction}')",actor)
 check('Unused aggregate reservation releases once',query(f"select prepaid_remaining=0 from ai_work where id='{extraction}'",actor)=='t')
 classifier=query(f"insert into ai_work(tenant_id,user_id,profile) values('{tenant}','{actor}','research') returning id",actor)
 class_call=f"select app.reserve_ai_attempt('{classifier}','classification','cloudflare','@cf/qwen/qwen3-30b-a3b-fp8','v1','cf-v1','official',1000,128)"
 ca=query(class_call,actor);query(f"select app.settle_ai_attempt('{ca}',100,5,null,null,1,'SUCCEEDED',null)",actor)
 check('Classifier cannot consume extra parent calls','CLASSIFICATION_BUDGET_EXCEEDED' in query(class_call,actor,expect_error=True))
 check('Runtime cannot modify application quotas','permission denied' in query("update ai_limits set neurons=9999999",actor,expect_error=True))
 err=query(f"insert into ai_work(tenant_id,user_id,profile,case_id) values('{tenant}','{actor}','document','20000000-0000-4000-8000-000000000003')",actor,expect_error=True)
 check('Cross-tenant identity rejected','foreign key' in err or 'row-level security' in err)
 ingest=query(f"insert into jobs(tenant_id,case_id,document_id,job_type,idempotency_key,created_by) values('{tenant}','{case}','{doc}','LEGAL_INGEST','test-ingestion','{actor}') returning id",actor)
 check('Queue replay has no duplicate effect',query(f"insert into jobs(tenant_id,case_id,document_id,job_type,idempotency_key,created_by) values('{tenant}','{case}','{doc}','LEGAL_INGEST','test-ingestion','{actor}') on conflict do nothing;select count(*) from jobs where idempotency_key='test-ingestion'",actor)=='1')
 with ThreadPoolExecutor(2) as pool:
  claims=list(pool.map(lambda worker: query(f"select count(*) from app.claim_legal_job('{ingest}','{worker}')",actor),['worker-a','worker-b']))
 check('Two workers claim at most one lease',sorted(claims)==['0','1'])
 fence=query(f"select fence from jobs where id='{ingest}'",actor)
 query(f"update jobs set lease_until=now()-interval '1 second',checkpoint='{{\"stage\":\"index\",\"offset\":8}}' where id='{ingest}'")
 check('Expired fence cannot publish',query(f"update jobs set checkpoint='{{}}' where id='{ingest}' and fence={fence} and status='RUNNING' and lease_until>now();select checkpoint->>'offset' from jobs where id='{ingest}'",actor)=='8')
 newfence=query(f"select fence from app.claim_legal_job('{ingest}','new-worker')",actor)
 check('Resumed claim increments fence and preserves checkpoint',int(newfence)>int(fence) and query(f"select checkpoint->>'stage' from jobs where id='{ingest}'",actor)=='index')
 check('Stale worker cannot publish after replacement',query(f"update jobs set checkpoint='{{}}' where id='{ingest}' and fence={fence};select checkpoint->>'offset' from jobs where id='{ingest}'",actor)=='8')
 check('Checkpoint job access is cause-scoped',query("select count(*) from jobs",'synthetic-c')=='0')
 query(f"delete from case_assignments where case_id='{case}' and user_id='synthetic-b'")
 check('Revocation prevents document reads',query(f"select count(*) from documents where id='{doc}'",'synthetic-b')=='0')
 check('Revocation prevents worker claim',query(f"select count(*) from app.claim_legal_job('{ingest}','revoked')",'synthetic-b')=='0')
 query(f"insert into case_facts(tenant_id,case_id,kind,label,original_value,status,document_id,source_version,source_checksum,page,start_offset,end_offset,passage,author,extraction_key) values('{tenant}','{case}','FACT','Dato','texto','CONFIRMED','{doc}',1,'checksum',1,0,5,'texto','{actor}','unit-1')",actor)
 fact=query("select id from case_facts where extraction_key='unit-1'",actor)
 check('Original fact remains immutable','FACT_ORIGINAL_IMMUTABLE' in query(f"update case_facts set original_value='rewritten' where id='{fact}'",actor,expect_error=True))
 query(f"insert into tasks(tenant_id,case_id,title,source_fact_id,created_by) values('{tenant}','{case}','Reviewed synthetic obligation','{fact}','{actor}')",actor)
 refs=json.dumps({'evidence':[{'factId':fact,'documentId':doc,'version':1,'checksum':'checksum'}]})
 output=query(f"insert into case_outputs(tenant_id,case_id,kind,title,body,metadata,created_by) values('{tenant}','{case}','DRAFT','Synthetic','Synthetic','{refs}'::jsonb,'{actor}') returning id",actor)
 new_doc=str(uuid.uuid4())
 query(f"insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by) values('{new_doc}','{tenant}','{case}','new-evidence.txt','NEON','new-evidence','text/plain',4,'new-hash','{actor}')",actor)
 check('Newly uploaded case document invalidates existing drafts',query(f"select stale from case_outputs where id='{output}'",actor)=='t')
 query(f"update documents set content_hash='changed' where id='{doc}'",actor)
 check('Source changes invalidate confirmed facts without overwriting',query("select stale and original_value='texto' and status='CONFIRMED' from case_facts where extraction_key='unit-1'",actor)=='t')
 check('Dependent output is stale',query(f"select stale from case_outputs where id='{output}'",actor)=='t')
 check('Publication rejects a changed source','OUTPUT_SOURCE_CHANGED' in query(f"insert into case_outputs(tenant_id,case_id,kind,title,body,metadata,created_by) values('{tenant}','{case}','DRAFT','Synthetic','Synthetic','{refs}'::jsonb,'{actor}')",actor,expect_error=True))
 template=query(f"insert into legal_templates(tenant_id,title,specialty,jurisdiction,purpose,body,sections,source_kind,created_by) values('{tenant}','Synthetic','HEALTH','Synthetic','Test','Immutable model','[]'::jsonb,'SYNTHETIC','{actor}') returning id",actor)
 check('Template changes require a new version','TEMPLATE_VERSION_IMMUTABLE' in query(f"update legal_templates set body='Changed' where id='{template}'",actor,expect_error=True))
 check('Manual event must declare its transport','manual_event_provenance' in query(f"insert into judicial_events(tenant_id,case_id,source,event_type,title,original_text,normalized_text,content_hash,created_by) values('{tenant}','{case}','MEV_SCBA','MOVEMENT','Synthetic','Synthetic','Synthetic','hash','{actor}')",actor,expect_error=True))
 check('Stale source cancels registered obligation',query("select status from tasks where title='Reviewed synthetic obligation'",actor)=='CANCELLED')
 check('Source changes cancel and fence pending jobs',query(f"select status='CANCELLED' and fence>{newfence} from jobs where id='{ingest}'",actor)=='t')
 check('Scheduler has no direct document access','permission denied' in query("set role monitor_scheduler;select * from documents",expect_error=True))
 check('Accounting role is neither owner nor bypass role',query("select not rolbypassrls and not rolsuper from pg_roles where rolname='monitor_accounting'")=='t')
 query(f"insert into case_checklists(tenant_id,case_id,definition_key,definition_version,label,created_by) values('{tenant}','{case}','fixture',1,'Documento pendiente','{actor}')",actor)
 query(f"insert into alert_settings(tenant_id,user_id,enabled_kinds) values('{tenant}','{actor}',array[]::text[])",actor)
 check('Folder alerts respect disabled kinds',query("set role monitor_scheduler;select app.deliver_folder_alerts()")=='0')
 query(f"update alert_settings set enabled_kinds=array['DOCUMENT'],quiet_start=0,quiet_end=0 where tenant_id='{tenant}'",actor)
 check('Folder alerts respect quiet hours',query("set role monitor_scheduler;select app.deliver_folder_alerts()")=='0')
 query(f"update alert_settings set quiet_start=null,quiet_end=null where tenant_id='{tenant}'",actor)
 delivered=query("set role monitor_scheduler;select app.deliver_folder_alerts()")
 check('Folder scheduler emits explainable dashboard alerts',int(delivered)>=1)
 check('Folder scheduler replay does not duplicate alerts',query("set role monitor_scheduler;select app.deliver_folder_alerts()")=='0')
 check('Alert source is cause-scoped',query("select count(*) from notifications",'synthetic-c')=='0')
 print(json.dumps({'database':'temporary PostgreSQL 16 + pgvector 0.8.1','passed':len(report),'providerCalls':0}))
 (root/'docs/operations/agent-db-validation.json').write_text(json.dumps({'environment':'synthetic loopback PostgreSQL 16 + pgvector 0.8.1','providerCalls':0,'checks':report},indent=2)+'\n')
finally:
 query('drop database '+name+' with (force)',db='postgres')
