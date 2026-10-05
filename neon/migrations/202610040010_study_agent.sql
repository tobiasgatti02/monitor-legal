begin;
-- Same daily quotas and RLS. More steps allow schema lookup, record lookup and execution.
insert into ai_profiles(name,input_limit,output_limit,call_limit,tool_limit,per_call_output)
values('study',96000,4800,8,12,600) on conflict(name) do nothing;
commit;
