# Features

Reference doc, not a PRD: no `Status:` line. The full list of what ships in the box.

## Agents and chat

- Models from Anthropic, OpenAI, Google (GenAI and Vertex), Mistral, and local models through LM Studio
- Per-agent instructions, model, reasoning effort, knowledge, memory, and toolset
- Knowledge from PDFs, Word files, text, or markdown. Small sets go into the prompt. Large sets switch to vector based retrieval (RAG) automatically.
- Streaming chat over WebSockets, with stop, branching at any message, and full-text chat search
- Attach images, PDFs, Word, Excel, and text files to a message
- Notifications for finished runs and generated media

## Datasets

- Typed columns: text, number, date, or select
- Grid editing for you, read and write tools for agents
- Every row records whether a user, an agent, or an outside app wrote it
- Writes are validated against the column schema, so a bad agent write becomes a visible tool error
- Export any dataset to Excel

## Shared workspace

- Markdown documents with a rich-text editor, in folders, shared by you and your agents
- Kanban board with labels, subtasks, due dates, reminders, and file attachments. Agents get create, update, and move tools.
- Media library for every generated and uploaded file, with reference counting so shared files are never deleted early
- Home overview with the latest tasks, chats, workflows, agents, and documents

## Generation

- Text-to-image with FLUX, OpenAI, and Imagen. Negative prompts, seeds, and reference images where the model supports them.
- Text-to-video with FLUX 3 video and Veo. Draft mode gives a cheap preview that you can enhance to full quality later.
- Jobs run in the background and notify you when done
- Optional visible "AI generated" badge on images and videos, for EU AI Act disclosure

## Automation

- Visual workflow builder with manual and cron triggers, agent nodes, team nodes, conditions, and transforms
- Team nodes: a lead agent delegates to up to five specialists in parallel
- Full run traces with every delegation, tool call, timing, and token use
- Failed runs retry and resume from the last completed step
- Overlap protection for schedules, plus a sweeper for stuck runs
- Scraping service with a stealth headless browser, so agents can read real pages
- Optional usage-based credit ledger for metered AI operations (off by default)

## Email

- Gmail and Outlook
- Incoming mail sorted into categories you define
- Auto-draft per category or sender, written by a configurable agent

## MCP server

- Off by default
- Access per resource: Off, Read, or Read and write
- Every write is logged
