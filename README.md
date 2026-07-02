# Build My Site For Me

A live personal-site builder. A visitor opens a room, gets a unique room number, copies a prompt into their AI agent, and the agent POSTs progress plus approved personal context back to that room. The website updates over Server-Sent Events while the user watches.

## Run locally

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

## API

Create a room:

```text
POST /api/build-room
```

Open/use a room:

```text
GET /room/:roomId
```

Stream room events:

```text
GET /api/build-room/:roomId/events
```

Send live status:

```text
POST /api/build-room/:roomId/status
```

Status payload shape:

```json
{
  "stage": "gathering",
  "message": "Gathering quirks, catchphrases, taste, and public-safe lore.",
  "progress": 45
}
```

Submit approved context:

```text
POST /api/build-room/:roomId/context
```

Strict payload shape:

```json
{
  "name": "Use the user's real approved public name",
  "summary": "Use a funny, specific, public-safe summary with the energy of the user's AI agent writing a dating-profile roast they approved for display.",
  "interests": ["real approved obsession, recurring bit, or interest"],
  "projects": ["real approved project"],
  "skills": ["real approved skill, superpower, or suspiciously specific competence"],
  "taste": ["real approved taste note, preference, anti-preference, or roastable standard"],
  "traits": ["real approved trait", "real approved trait", "real approved trait"],
  "testimonials": [
    { "quote": "Real funny approved quote about the user's personality, quirks, or lore.", "signed": "my AI" },
    { "quote": "Real funny approved quote about the user's taste, habits, or catchphrases.", "signed": "my AI" },
    { "quote": "Real funny approved quote that sounds like it came from an AI agent that knows the user too well.", "signed": "my AI" }
  ]
}
```

## Deploy

Render is the simplest first deployment target for this version because it runs as one persistent Node web service. Push this folder to GitHub, create a Render Blueprint from `render.yaml`, then point your domain at the Render service.

For scale, move room state out of process memory. Good next targets are Redis-backed rooms on Render/Fly or Cloudflare Durable Objects.

## Render MCP

Render's official MCP server is hosted at `https://mcp.render.com/mcp`. Create a Render API key, then run:

```bash
./scripts/setup-render-mcp.sh
```

The script prompts for the key without echoing it, backs up `~/.codex/config.toml`, and adds the Codex MCP block. Restart Codex afterward, then set the active workspace with:

```text
Set my Render workspace to <workspace name>
```
