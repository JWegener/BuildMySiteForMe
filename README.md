# Build My Site For Me

A live personal-site builder. A visitor opens a session, gets a unique Session ID, copies a tiny prompt into their AI agent, and the agent POSTs progress plus approved personal context back to that session. The website updates over Server-Sent Events while the user watches.

## Agent Prompt

```text
Read https://build-my-site-for-me.onrender.com/skill.md and follow the instructions to build my personal website.

Use this Session ID: 123456
```

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:4178/
```

Live:

```text
https://build-my-site-for-me.onrender.com/
```

Hosted skill:

```text
https://build-my-site-for-me.onrender.com/skill.md
```

## API

Create a session:

```text
POST /api/build-session
```

Open/use a session:

```text
GET /session/:sessionId
```

Stream session events:

```text
GET /api/build-session/:sessionId/events
```

Send live status:

```text
POST /api/build-session/:sessionId/status
```

Status payload shape:

```json
{
  "stage": "gathering",
  "message": "Gathering public-safe details, recurring themes, projects, and taste.",
  "progress": 45
}
```

Submit approved context:

```text
POST /api/build-session/:sessionId/context
```

Strict payload shape:

```json
{
  "name": "Use the user's real approved public name",
  "summary": "Use a warm, specific, public-safe summary of who the user is, what they build, and what they care about.",
  "interests": ["real approved interest, recurring theme, or public-safe obsession"],
  "projects": ["real approved project"],
  "skills": ["real approved skill, superpower, or unusually specific competence"],
  "taste": ["real approved taste note, preference, anti-preference, or house style"],
  "traits": ["real approved trait", "real approved trait", "real approved trait"],
  "photos": [
    { "url": "approved public image URL", "alt": "public-safe alt text", "caption": "optional public-safe caption", "source": "optional source label" }
  ],
  "testimonials": [
    { "quote": "Warm, specific quote about the user's personality, values, or work.", "signed": "my AI" },
    { "quote": "Warm quote about the user's taste, habits, or recurring themes.", "signed": "my AI" },
    { "quote": "Public-safe quote that sounds like it came from an AI agent that knows the user well.", "signed": "my AI" }
  ]
}
```

## Compatibility

The server still accepts the previous `/api/build-room/...` and `/room/:id` paths as compatibility aliases, but all public copy and new integrations should use Session ID and `/api/build-session/...`.

## Deploy

Render is the simplest first deployment target for this version because it runs as one persistent Node web service. Push this folder to GitHub, create a Render Blueprint from `render.yaml`, then point your domain at the Render service.

For scale, move session state out of process memory. Good next targets are Redis-backed sessions on Render/Fly or Cloudflare Durable Objects.

## Render MCP

Render's official MCP server is hosted at `https://mcp.render.com/mcp`. Create a Render API key, then run:

```bash
./scripts/setup-render-mcp.sh
```

The script prompts for the key without echoing it, backs up `~/.codex/config.toml`, and adds the Codex MCP block. Restart Codex afterward, then set the active workspace with:

```text
Set my Render workspace to <workspace name>
```
