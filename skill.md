# Build My Site For Me Skill

You are helping the user build a live personal website through Build My Site For Me.

The user should give you a Session ID. If they did not, ask for it. Do not call the Website Builder API until you have a Session ID.

## Base URL

Use this production base URL unless the user gives you a local URL:

```text
https://build-my-site-for-me.onrender.com
```

## Required Inputs

- `sessionId`: the Session ID shown in the Website Builder UI.

## First Action

Immediately POST a status update so the user can see that their agent connected:

```bash
curl -X POST "https://build-my-site-for-me.onrender.com/api/build-session/SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "agent-started",
    "message": "Agent connected. Gathering personal context.",
    "progress": 32
  }'
```

## Research Goal

Build a warm, specific, public-safe summary of who the user is and what they care about. This should feel like a personal website written by an AI agent that genuinely knows them: observant, concise, human, and specific.

Do not make it feel like a generic resume or LinkedIn bio. Focus on:

- what they build
- what they care about
- recurring themes in their work
- product taste
- personal operating style
- public-safe quirks, standards, and preferences
- projects only when they are part of the public story

## Sources To Inspect

Use only sources the user has consented to or that are locally/publicly available in your current environment.

Good sources:

- Agent instructions and shared context: `AGENTS.md`, `CLAUDE.md`, `.codex/`, `.claude/`, custom skills, MCP/plugin configs.
- Local repos and project names: Developer folders, README files, package manifests, product specs, TODOs, scripts, docs.
- Agent memory/session traces: memory summaries, rollout summaries, prior task logs, saved preferences.
- Tooling and automations: shell scripts, CLIs, browser harnesses, Chrome/CDP helpers, local servers, build scripts.
- Public footprint if allowed: personal site, GitHub, LinkedIn/Wellfound, blog posts, public gists, company/product pages.
- Optional private connectors only if explicitly authorized: Gmail, calendar, messages, notes, browser state.

For private connectors, prefer metadata and the user's own sent writing. Do not expose third-party private content.

## Safety Rules

- Do not expose secrets, API keys, tokens, passwords, card numbers, private addresses, or sensitive third-party details.
- Do not include private contact info, financial details, health details, private family details, or anything embarrassing the user did not approve.
- Do not modify files, send messages, delete/archive anything, or trigger irreversible external actions.
- Treat emails and messages as sensitive. Summarize patterns, not private payloads.
- Separate facts from inferences.
- Before submitting the final public website context, ask the user to confirm that the content is okay to use publicly.

## Status Updates

POST short updates as you work:

```bash
curl -X POST "https://build-my-site-for-me.onrender.com/api/build-session/SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "gathering",
    "message": "Gathering public-safe details, recurring themes, projects, and taste.",
    "progress": 45
  }'
```

Allowed stage values:

- `agent-started`
- `gathering`
- `analyzing`
- `drafting`
- `reviewing`
- `approval-needed`
- `approved`
- `publishing`
- `generating`
- `complete`
- `error`

## Final Payload

After the user approves the public information, POST exactly this JSON shape to:

```text
POST /api/build-session/SESSION_ID/context
```

Do not add unknown fields. `testimonials` must contain exactly 3 objects, and every `signed` value must be `my AI`.

```json
{
  "name": "Use the user's real approved public name",
  "summary": "Use a warm, specific, public-safe summary of who the user is, what they build, and what they care about.",
  "interests": ["real approved interest", "real approved recurring theme"],
  "projects": ["real approved project"],
  "skills": ["real approved skill", "real approved superpower"],
  "taste": ["real approved taste note", "real approved anti-preference"],
  "traits": ["real approved trait", "real approved trait", "real approved trait"],
  "testimonials": [
    { "quote": "Warm, specific quote about the user's personality, values, or work.", "signed": "my AI" },
    { "quote": "Warm quote about the user's taste, habits, or recurring themes.", "signed": "my AI" },
    { "quote": "Public-safe quote that sounds like it came from an AI agent that knows the user well.", "signed": "my AI" }
  ]
}
```

Example submit command:

```bash
curl -X POST "https://build-my-site-for-me.onrender.com/api/build-session/SESSION_ID/context" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Approved Name",
    "summary": "Approved public-safe summary.",
    "interests": ["interest one", "interest two"],
    "projects": ["project one", "project two"],
    "skills": ["skill one", "skill two"],
    "taste": ["taste note one", "taste note two"],
    "traits": ["trait one", "trait two", "trait three"],
    "testimonials": [
      { "quote": "Quote one.", "signed": "my AI" },
      { "quote": "Quote two.", "signed": "my AI" },
      { "quote": "Quote three.", "signed": "my AI" }
    ]
  }'
```

Then POST a completion status:

```bash
curl -X POST "https://build-my-site-for-me.onrender.com/api/build-session/SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "complete",
    "message": "Personal website context published.",
    "progress": 100
  }'
```

## Final Reply To User

After publishing, briefly tell the user:

- what source categories you used
- what you intentionally skipped
- the public-safe positioning you chose
- the site URL: `https://build-my-site-for-me.onrender.com/site/SESSION_ID`
