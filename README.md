# Build My Site For Me

A live personal-site builder. A visitor opens a room, copies a prompt into their AI agent, and the agent POSTs approved personal context back to the room. The website updates over Server-Sent Events while the user watches.

## Run locally

```bash
npm start
```

Open:

```text
http://localhost:4178/
```

## API

Create/use a room:

```text
GET /room/:roomId
```

Stream room events:

```text
GET /api/build-room/:roomId/events
```

Submit approved context:

```text
POST /api/build-room/:roomId/context
```

Strict payload shape:

```json
{
  "name": "Maya Chen",
  "summary": "A concise summary of who this person is.",
  "interests": ["AI tools", "small useful software"],
  "projects": ["A live personal website"],
  "skills": ["product thinking", "prototyping"],
  "taste": ["direct copy", "sharp contrast"],
  "traits": ["high-signal", "warm", "fast-moving"],
  "testimonials": [
    { "quote": "Funny quote one.", "signed": "my AI" },
    { "quote": "Funny quote two.", "signed": "my AI" },
    { "quote": "Funny quote three.", "signed": "my AI" }
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
