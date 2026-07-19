# Growing Child AI

Growing Child is a local language-learning feature. It is not a model-training pipeline and does not fine-tune a remote model. It learns word frequencies, topics, short transition chains and safe conversation context in `data/growing_child.sqlite`. Existing tables are migrated in place with `CREATE TABLE IF NOT EXISTS`, so upgrades retain the vocabulary and accumulated counters.

## How a response is produced

1. Allowed Minecraft, owner-DM or configured Discord messages are filtered for secrets and personal data.
2. Safe words, topics and transition statistics are learned locally. The latest messages in the same conversation form a bounded context window.
3. Explicit statements such as “I prefer silk touch pickaxes” can create a memory with its subject, kind, confidence, source and expiry date.
4. Local candidates are generated from learned transition chains. Gemini may propose constrained candidates only when `aiGenerationEnabled`, `GEMINI_ENABLED` and `GEMINI_API_KEY` are all enabled.
5. Every candidate is scored for coherence, toxicity, similarity to recent answers and unknown-word ratio. Rejected candidates and their reasons are retained for the administrator.

The external AI never receives a request when its runtime switch is off. It receives only the bounded recent context, selected safe memories and learned vocabulary when enabled; local filtering still decides whether its output can be used.

## Memory and privacy

- Memories have a configurable TTL (`memoryDefaultTtlDays`) and a confidence score.
- Repeating or correcting a fact supersedes the prior value without silently changing its history.
- A user can send `forget me` or `forget fact #ID`. Administrators can correct/delete facts or forget a user from the **Child AI** page.
- Messages containing credential terms, email addresses, URLs, phone/card-like numbers, IP addresses or coordinate-like data are not learned or stored as conversation context.
- Import validates memory and conversation rows using the same sensitive-data rule. Import is a merge: existing vocabulary counters and accumulated experience are not overwritten.

## Retention and administration

The database periodically removes expired/deleted memories and caps context, generation attempts, recent phrases and memories. If it exceeds `maxDatabaseBytes`, old raw learning history and sequences are trimmed before SQLite compaction; the vocabulary is retained.

The administrator-only **Child AI** dashboard shows vocabulary, topics, active memory, emotion history, recent accepted responses and rejection reasons. State can be exported/imported as versioned JSON. All changes submitted from the page use the existing audited bot-command channel.

The main limits and quality thresholds live in [`config.json`](config.json). Run `npm test` for the smoke test and deterministic memory, privacy, quality, migration and external-AI gating checks.
