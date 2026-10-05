begin;
-- More room for reasoning and a complete tool call; daily neuron quotas stay enforced.
update ai_profiles set output_limit=12800,per_call_output=1600 where name='study';
commit;
