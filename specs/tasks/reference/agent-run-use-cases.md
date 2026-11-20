# Agents on tasks: use cases

Reference doc for #455 and #456, written 2026-11-20. It lists what task runs are good for with
the agent tools RAGNA Studio has today: web search, web browser, documents, datasets, cloud drive
reads, image and video generation, LinkedIn drafts, memory and the agent's knowledge.

The pattern: **delegated work whose output stays inside RAGNA Studio**, gets reviewed, and only
then goes out.

## Strong fits

### Research and briefs

- _"Competitor overview: pricing and positioning of X, Y and Z."_ The agent searches, reads the
  sites and writes a document with sources.
- _"Prepare for the call with ACME on Thursday."_ Company background, recent news and likely
  questions as a one-page brief.
- _"What changed in the EU AI Act guidance this month?"_ A summary with links.

### Filling and enriching datasets

- _"Find 30 agencies in Munich doing B2B video, add them to the Leads dataset."_ Rows with name,
  URL, size and contact page.
- _"Fill the missing industry and country columns in the Accounts dataset."_ The agent reads each
  row and looks up the rest.
- _"Tag the feedback dataset rows by topic and sentiment."_

### Content drafts

- _"LinkedIn post announcing the webinar, two variants."_ Saved as LinkedIn drafts, never
  published.
- _"Draft the blog post from the outline in the description."_ Becomes a document.
- _"Three hero images for the landing page, style per the attached brief."_ A short product clip
  with video generation works the same way.

### Working from existing material

Cloud drive reads only. Writes are refused in task runs (see below).

- _"Summarise the Q3 reports in the Finance folder into one page."_ The agent reads Drive files
  and writes a document.
- _"Extract all deadlines from the attached contract into the Deadlines dataset."_
- _"Compare the two attached proposals and list the differences."_

### Planning (phase 2, #456)

- _"Plan the product launch."_ The agent proposes subtasks: press list, post drafts, landing page
  images. The team accepts the ones it wants and starts agent runs on some of them.

## Why a task and not a chat

- The work takes minutes and many tool calls. Nobody wants to watch it.
- Several tasks run at once: start five research tasks and keep working.
- The result is an artifact the team reviews: a document, dataset rows, a draft, an image. The
  task shows that it exists and what state it is in.

## Poor fits

| Work                                       | Better place                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurring work ("weekly competitor check") | A workflow with a schedule                                                                                                                               |
| Exploring, brainstorming                   | Chat: it needs turn-by-turn steering                                                                                                                     |
| Writing or sending outside RAGNA Studio    | Not yet. Drive writes are refused in runs until #281. Agents have no tool to send email or publish posts. The agent prepares the draft, a human sends it |
| Vague tasks ("Fix marketing")              | Works, but ends with the agent asking a question. A clear description saves a run                                                                        |

## Dates

Write any date the work depends on into the description: _"The webinar is on 5 December, post
the announcement a week before."_ The due date is planning metadata for people and the agent
doesn't see it. The agent does know today's date.

To run tasks on a schedule, use a workflow. A later workflow step could start runs on tasks with
a given label every Monday.

## What this means for the design

The safest and most useful runs write only internal, reviewable artifacts. That matches the human
gates in the PRDs: a person starts the run, reviews the result, and decides what leaves RAGNA
Studio.
