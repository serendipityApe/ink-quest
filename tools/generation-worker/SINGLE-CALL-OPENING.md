# Single-call opening

New text-first openings may use `GENERATION_SINGLE_CALL_OPENING=true` to request a
validated `{ plan, scene }` in one model call. Original premise/setup are included.
The existing model, reasoning setting and token ceiling remain unchanged.

## Rollout order

1. Run offline provider, runner, workerd queue and real PostgreSQL concurrency gates.
2. Apply additive migration `202611110005_single_call_opening.sql`.
3. Deploy the compatible Worker with `GENERATION_SINGLE_CALL_OPENING=true` and
   `GENERATION_ASYNC_DICTIONARY=true`; existing readiness and dictionary gates stay.
4. Verify the deployed version and `generation_llm_usage.stage=opening` rather than
   interpreting the retained queue phase name `plan` as a separate planning call.

The migration permits `plan -> prepare` only for an opening whose fenced paid call
has begun and whose complete plan, scene, three choices and empty preparation are
present. It does not create nodes, choose branches or charge credits. The existing
commit path still atomically creates the node, advances the story and settles once.

Legacy plan-only checkpoints continue at `write`. Continuations start at `write`
and never call the combined opening method. Jobs already in preparation retain
their frozen result when the feature flag is switched off. A malformed completed
opening does not fall back to a second model call; existing safe-error/release
semantics apply. An uncertain paid response is not automatically replayed.

For rollback, disable the flag or deploy the earlier compatible Worker. Retain the
additive database migration. Old Workers can consume the existing `prepare`
checkpoints; do not roll back schema under live jobs.

The provider asks for natural paragraphs separated by blank lines. Parsing retains
those newlines. Presentation of legacy unsegmented prose is a separate reader
concern; never mutate the stored text merely to insert display paragraphs, since
lexical/audio offsets refer to the original text.

## Observed versus expected

Offline tests prove one paid-request boundary instead of two, no intermediate
write delivery for a new opening, valid continuation context, and single billing
under duplicates/lost checkpoint responses. They do not establish real model
latency or story quality. A paid comparison must hold model, learner level and
substantial output length constant and report actual tokens/paragraphs, not claim
speed by shortening the scene. Model usage logs contain timings/counters only, not
prompts, user stories or credentials.

### One authorized API comparison (2026-11-11)

A synthetic B1 English mystery, requested at 250–350 words, was run once per
variant using `gpt-6-luna`, low reasoning, the same 6000-token ceiling and no retry.
No production story or site-credit transaction was created.

| Variant | Requests | API elapsed | Scene words | Paragraphs | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous plan + write | 2 | 14.346 s | 300 | 6 | 1857 |
| Combined opening | 1 | 10.375 s | 310 | 10 | 1414 |

The candidate was 27.7% faster at the API layer in this one sample and used 23.9%
fewer total tokens. Both had three distinct choices and retained the supplied
premise. This is not a production end-to-end benchmark or a p95/quality guarantee.
All three calls together used 3271 tokens; actual dollar billing was not available.
