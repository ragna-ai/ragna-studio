# Prompt editor: edit agent and workflow prompts as markdown (PRD)

> **Status: proposed** (2026-11-05). Issue #284. Extends [the shared editor](../prd.md).

Users write agent instructions, agent context and workflow prompts in plain textareas. This PRD
moves those fields onto the shared rich text editor. The stored value stays markdown, and it
reaches the model exactly as the user wrote it.

## Problem

**Long prompts are hard to structure in a textarea.** Instructions and context hold headings,
lists and code samples (context up to 30,000 characters). A textarea shows them as raw text,
without headings or list formatting.

**The editor as it is would corrupt prompts.** Its markdown writer escapes text on every save.
We tested it against the installed version:

| User writes     | Editor saves     |
| --------------- | ---------------- |
| `<rules>`       | `&lt;rules&gt;`  |
| `{{user_name}}` | `{{user\_name}}` |
| `2 * 3`         | `2 \* 3`         |

XML-style tags and `{{input}}` placeholders are common in prompts. The model would receive HTML
entities and backslashes instead.

## Goals

- Users edit the four prompt fields with the same inline controls as documents.
- What the user wrote is what the model receives.
- The next prompt field takes one line to switch.
- **Success signal:** no support reports of changed or broken prompts after the switch.

## Non-goals

- **Workflow transform template.** It shapes data between nodes and can hold JSON. It stays a
  textarea.
- **Agent memory.** It is written by the agent, not authored by the user.
- **Storage changes.** The fields stay plain text columns. The API only gains length limits
  (US-5).

## User stories

Roles: workspace editor (edits agents and workflows).

### US-1 Format agent instructions and context (P1)

As a workspace editor, I want to format an agent's instructions and context with headings,
lists and code, so that long prompts stay readable while I write them.

- **US-1.1** Given an agent form, when the editor types `# Role` at the start of an empty
  instructions field, then it becomes a heading, and the saved instructions start with `# Role`.
- **US-1.2** Given the instructions or context field, when the editor opens the insert menu,
  then it offers text blocks, lists, quotes, code and tables, but no images and no task lists.
- **US-1.3** Given a saved agent, when the editor reopens it, then both fields show the saved
  formatting.

### US-2 Prompts reach the model unchanged (P1)

As a workspace editor, I want tags, placeholders and symbols in my prompt saved exactly as I
typed them, so that the agent behaves the way I wrote it.

- **US-2.1** Given instructions containing `<rules>`, `</rules>`, `{{user_name}}`, `snake_case`
  and `2 * 3`, when the editor saves the agent, then the saved text contains each of them
  unchanged.
- **US-2.2** Given an agent whose instructions were written before this change, when the editor
  opens the agent and saves it without editing either field, then both fields are saved
  unchanged.
- **US-2.3** Given a prompt that contains a markdown table or image, when the editor edits
  another part of the prompt and saves it, then the table and image are still in the saved
  text.
- **US-2.4** Rule: text the editor saves and loads again is saved the same way a second time.
- **US-2.5** Given instructions holding an HTML image tag with an event attribute and a link to
  a `javascript:` URL, when the editor opens them in the formatted view, then no script runs
  and the link has no `javascript:` target.

### US-3 Format workflow prompts (P2)

As a workspace editor, I want the agent node and team node prompts in a workflow to use the
same editor, so that I write every prompt the same way.

- **US-3.1** Given a workflow agent or team node, when the editor writes a prompt with
  `{{input}}`, then the saved prompt contains `{{input}}` unchanged.
- **US-3.2** Given two agent nodes with different prompts, when the editor switches from one
  node to the other, then the field shows the prompt of the selected node.
- **US-3.3** Given an agent node with an empty prompt, when the editor saves the workflow, then
  the prompt error shows as before.

### US-4 Switch to the raw text (P2)

As a workspace editor, I want to switch a prompt field to its raw markdown, so that I can see
and edit exactly what the model receives.

- **US-4.1** Given instructions containing `<rules>` and a heading, when the editor switches the
  field to raw text, then it shows the stored text exactly, including `# ` and `<rules>`.
- **US-4.2** Given the raw view, when the editor changes the text and saves, then the saved text
  is exactly what they typed.
- **US-4.3** Given changes made in the raw view, when the editor switches back to the formatted
  view, then it shows those changes formatted.
- **US-4.4** Given the editor chose the raw view, when they open any prompt field later, then it
  opens in the raw view.
- **US-4.5** Given a workflow agent node with an empty prompt in the raw view, when the editor
  saves the workflow, then the prompt error shows.

### US-5 Prompt length limits (P1)

As a workspace editor, I want prompt fields to have a clear size limit, so that a teammate's
oversized prompt can't freeze the agent or workflow page for everyone.

- **US-5.1** Rule: instructions, context and the workflow agent and team node prompts hold at
  most 30,000 characters each.
- **US-5.2** Given a form, when a prompt field passes the limit, then the field shows an error
  naming the limit, and the form can't be saved.
- **US-5.3** Given an API request, when it creates or updates an agent or workflow with a
  prompt over the limit, then it is rejected with `400`.
- **US-5.4** Given an agent or workflow saved with a longer prompt before this change, when a
  user opens it, chats with it or runs it, then it works as before.
- **US-5.5** Given that agent, when an API request updates only its name, then the update
  succeeds.
- **US-5.6** Given a prompt field in either view, when the editor types, then it shows the
  current character count and the limit, updated with every change.
- **US-5.7** Given a prompt over the limit, when the editor views the field, then the count
  shows as an error. Typing and pasting are never cut off.

## Testing

| Criterion                      | Level            | Folder                                            |
| ------------------------------ | ---------------- | ------------------------------------------------- |
| US-1.2                         | unit (bun)       | `packages/editor/test/`                           |
| US-2.1, US-2.3, US-2.4         | unit (bun)       | `packages/editor/test/`                           |
| US-1.1, US-1.3                 | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-2.1, US-2.2                 | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-3.1, US-3.2                 | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-3.3                         | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-4.1 to US-4.5               | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-2.5, US-5.2, US-5.6, US-5.7 | e2e (Playwright) | `apps/web/e2e/`                                   |
| US-5.1, US-5.3 to US-5.5       | API              | `apps/api/test/agent/`, `apps/api/test/workflow/` |

## Standards checklist

- **Deletion:** n/a, no new data.
- **Retention:** n/a.
- **Erasure:** n/a, the fields already belong to the agent and workflow.
- **Docs:** `apps/docs` `agents/index.mdx` (instructions), `agents/knowledge.mdx` (context),
  `workflows/index.mdx` and `workflows/team-node.mdx` (prompts).

## Decisions

**The prompt profile writes text without escaping.** The model reads the stored markdown
directly, so a backslash or an HTML entity changes what it sees. The cost: a literal `*word*`
the user typed comes back as italics after reload, and a raw `<b>` becomes bold. For a prompt
the model reads those the same way. When the user needs exact control, the raw view (US-4)
edits the stored text directly. The alternative was a raw markdown editor only. It keeps every
byte but shows markup instead of formatting.

**The profile limits what the menus offer, not what the editor understands.** Every profile
parses and writes the full markdown set. A prompt with a table or image survives an edit, even
though the prompt menus don't offer images. Dropping those nodes from the prompt schema would
silently delete content on the first edit.

**Verbatim text relies on overriding a private Tiptap method.** The markdown package has no
public switch for escaping. We override it in one file, per editor instance, and round-trip
tests fail if an upgrade breaks it. The alternative was a `pnpm patch` that adds an option. It
is cleaner to type but has to be re-applied on every Tiptap upgrade. A follow-up asks Tiptap
upstream for a public option.

## Design

See [design.md](./design.md) and the build plan in [slices.md](./slices.md).
