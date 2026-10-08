# Chat regenerate (PRD)

> **Status: proposed.** Not yet built or scheduled.

Lets the user re-run the model for the chat's most recent assistant reply
without retyping their last message. The old reply is discarded and replaced
by the new one in place; nothing else in the conversation changes.

## Decisions

| Decision       | Choice                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| **Scope**       | Only the *last* assistant message is regenerable. Regenerating an earlier reply (which would also invalidate everything after it) is out of scope — see Non-goals. |
| **History**     | The old response is deleted, not kept. No ChatGPT-style "‹ 1/2 ›" version switcher. If regeneration fails or is aborted, the old response is left untouched (nothing is deleted until the new one succeeds). |
| **Entry point** | New "Regenerate" item in the existing hover "⋯" dropdown in `ChatMessage.vue` (same menu branching added), shown only on the last assistant message. |
| **Cost**        | A regenerate is a real model call and is credit-gated exactly like a normal turn (`specs/credits/prd.md`) — regenerating a response the user didn't like still costs credits. |

## Why last-message-only, discard-not-keep

`specs/chat/chat-message-persistence.md` already notes the wire protocol only
supports appending to the end of persisted history — the client sends the
newest message, the server rebuilds everything else from the DB. Supporting
"regenerate from an earlier point" would mean truncating history mid-chat,
which is a bigger, more destructive feature (closer to edit-and-resend) and
is explicitly listed as a **separate**, deferred feature in both that doc and
`specs/chat/branching.md`'s Non-goals. Restricting v1 to the last message
avoids that: there's nothing after it to truncate, so the existing
"server rebuilds from DB + one delta" shape barely changes.

Keeping multiple versions per turn (a real "regenerate history") would need a
schema change — some notion of grouping variant messages and an "active"
pointer — that nothing in `chat_messages` has today (`id`, `chat_id`, `role`,
`parts`, `metadata`, timestamps only, per persistence doc). The unused
`MessageBranch*.vue` components mentioned in `specs/chat/branching.md` are a
ready-made carousel UI for exactly this, but wiring them up is deferred until
there's a real reason to keep old responses around instead of discarding them.

## Goals (v1)

- A "Regenerate" item in the message dropdown, visible only on the chat's
  last message when `message.role === 'assistant'`.
- Clicking it re-runs the model over the same conversation history (same
  agent, same prior turns), replacing the old assistant reply with a new one.
- Disabled while a response is already streaming/submitting for that chat.
- The old response is deleted from `chat_messages` only after the new one
  finishes successfully; an aborted or errored regenerate leaves the original
  response in place, same as a normal turn's abort/error semantics.
- Regeneration is credit-gated and settled the same way a normal turn is.

## Non-goals (v1)

- Regenerating any message other than the last one.
- Edit-and-resend for user messages (same "not supported by the wire
  protocol today" limitation noted in `specs/chat/chat-message-persistence.md`).
- Keeping multiple response versions or a switcher UI between them.
- Picking a different model/agent for the regenerated response — it reuses
  the chat's current agent, same as any other turn.

## Wire protocol (apps/api)

New WS client frame type, alongside the existing `subscribe` / `unsubscribe`
/ `message` / `abort` (`apps/api/src/ws/protocol.ts`):

```
{ channel: "chat:<chatId>", type: "regenerate", payload: { messageId: string } }
```

`messageId` is the id of the assistant message being regenerated. The client
sends no message content — the server already has the full history
persisted and only needs to know which trailing message to drop.

Handled in `apps/api/src/controllers/ws.controller.ts` next to the `message`
case. The `message` case's body today is: parse the payload, call
`runChatStream`, publish each chunk via `onChunk`, publish `done`, or publish
`error` on throw. `regenerate` needs the identical wrapper around a different
service call, so that try/catch/publish shape is extracted into one shared
helper both cases call:

```ts
async function runChatTurn(
  raw: ChatServerWebSocket,
  channel: string,
  execute: (onChunk: ChatStreamChunkSink) => Promise<void>,
): Promise<void> {
  try {
    await execute((chunk) => publishFrame(raw, { channel, type: 'chunk', payload: chunk }));
    publishFrame(raw, { channel, type: 'done' });
  } catch (error) {
    sendFrame(raw, { channel, type: 'error', payload: toErrorPayload(error) });
  }
}
```

`case 'message'` and the new `case 'regenerate'` each keep only their own
payload parsing/validation, then call `runChatTurn(raw, channel, (onChunk) =>
runChatStream(...))` / `runChatTurn(raw, channel, (onChunk) =>
regenerateChatStream(...))` respectively. Both reuse the same per-chat
`inFlightRunsByChatId` guard as normal turns (one run per chat, regenerate
included) — that guard lives inside `chat.service.ts`, not here, so it
already covers both without changes.

## Service (apps/api/src/services/chat.service.ts)

Pushing the comparison further: the in-flight guard, `getChatByIdForUser`
fetch, and credit gate (`assertCanSpend`) are byte-for-byte identical in both
`runChatStream` and `regenerateChatStream` too — not just the
attachments/instructions/streamText/persistence tail. The **only** thing
that's actually different between a normal turn and a regenerate turn is how
`validUiMessages` gets built, plus the two small side effects that come with
that (persist a new user message and maybe compute a title, vs. nothing to
persist and no title). So the whole function is one shared implementation;
each caller supplies only that one small piece as a closure:

```ts
interface ChatTurnPlan {
  validUiMessages: UIMessage[];
  titlePromise: Promise<string> | null;
  onSuccess?: () => Promise<void>; // extra work once the new response is confirmed persisted
}

interface ExecuteChatTurnParams {
  chatId: string;
  userId: string;
  buildTurn: (ctx: {
    userChat: /* return type of getChatByIdForUser */;
    agent: /* userChat.agent */;
  }) => Promise<ChatTurnPlan>;
}

async function executeChatTurn(
  params: ExecuteChatTurnParams,
  onChunk: ChatStreamChunkSink,
): Promise<void>;
```

`executeChatTurn` owns everything: the in-flight guard, `getChatByIdForUser`,
`assertCanSpend`, calling `buildTurn({ userChat, agent })` to get the plan,
loading `chatAttachments`, `resolveModelFacingMessages`/
`convertToModelMessages`, `buildAgentInstructions`, the
`createUIMessageStream`/`streamText` call, the title write-back (skipped when
`titlePromise` is `null`), the `onEnd` persistence (calling `onSuccess` first
when provided, then `upsertChatMessages`, both only in the existing
`!isAborted && finishReason !== 'error'` success branch), and the final
`for await` chunk loop.

Both exported functions become thin:

```ts
export function runChatStream(
  { chatId, userId, message }: RunChatStreamParams,
  onChunk: ChatStreamChunkSink,
): Promise<void> {
  return executeChatTurn(
    {
      chatId,
      userId,
      buildTurn: async ({ userChat }) => {
        const validated = await safeValidateUIMessages({
          messages: [...userChat.messages, message],
        });
        if (!validated.success) throw new BadRequestException('Invalid messages format');
        const validUiMessages = validated.data;
        const lastUiMessage = validUiMessages.at(-1);

        if (lastUiMessage?.role === 'user') {
          await upsertChatMessages([toChatMessageRow(lastUiMessage, userChat.id)]);
        }

        return {
          validUiMessages,
          titlePromise:
            userChat.messages.length === 0 && lastUiMessage?.role === 'user'
              ? generateChatTitle({ uiMessage: lastUiMessage })
              : null,
        };
      },
    },
    onChunk,
  );
}

export function regenerateChatStream(
  { chatId, userId, messageId }: RegenerateChatStreamParams,
  onChunk: ChatStreamChunkSink,
): Promise<void> {
  return executeChatTurn(
    {
      chatId,
      userId,
      buildTurn: async ({ userChat }) => {
        const lastMessage = userChat.messages.at(-1);
        if (lastMessage?.id !== messageId || lastMessage.role !== 'assistant') {
          throw new ConflictException('Only the latest response can be regenerated');
        }

        const validated = await safeValidateUIMessages({
          messages: userChat.messages.slice(0, -1),
        });
        if (!validated.success) throw new BadRequestException('Invalid messages format');

        return {
          validUiMessages: validated.data,
          titlePromise: null,
          onSuccess: () => deleteChatMessageById({ chatId, messageId }),
        };
      },
    },
    onChunk,
  );
}
```

`deleteChatMessageById` is a new `chat.repo.ts` function. Because `onSuccess`
only runs inside `onEnd`'s existing success branch, an aborted or errored
regenerate never deletes the old row — the original reply survives untouched,
same guarantee as before, now for free from `executeChatTurn` rather than
something `regenerateChatStream` has to get right on its own.

No changes to `runChatStream`'s external behavior or its callers — this is a
pure internal refactor plus the new sibling function.

## Web app (apps/web)

- **`WebSocketChatTransport.sendMessages`**: branches on the `trigger` field
  `useChat`'s `sendMessages` options already carry (`'submit-message'` vs
  `'regenerate-message'`, unused today). For `'regenerate-message'`, sends
  the new `regenerate` frame with `{ messageId }` (from the options'
  `messageId` field) instead of a `message` frame; everything else
  (subscribe/chunk/done/error plumbing, abort handling) is unchanged since
  it's already transport-agnostic.
- **`ChatConversation.vue`**: destructures `regenerate` from `useChat(...)`
  (alongside the existing `messages, sendMessage, status, error`) and passes
  it down to `ChatMessage`, plus whether a given message is the last one in
  the list.
- **`ChatMessage.vue`**: new `DropdownMenuItem` ("Regenerate", a refresh-style
  icon) in the existing menu, next to "Copy text" / "Branch from here",
  `v-if="message.role === 'assistant' && isLast"`. Calls
  `regenerate({ messageId: message.id })`. Disabled while `status` is
  `submitted`/`streaming` (same `isBusy` condition `ChatConversation.vue`
  already computes).
- New locale key `chat.message.regenerate` (en-UK, de-DE), next to the
  existing `chat.message.branch`/`chat.message.copy` keys
  (`apps/web/i18n/locales/*.json`).

## Testing

Same pattern as `chat-branching.test.ts`
(`apps/api/test/chat/chat-branching.test.ts`): seed messages directly via
`createChatMessages`, since `runChatStream`/`regenerateChatStream` need a
live/mocked AI provider and are out of scope for plain persistence tests
(`specs/chat/branching.md`'s Testing section explains why).

Cases:

- Regenerating the last assistant message replaces it: message count is
  unchanged, the old message id is gone, a new assistant row exists with
  the same `chatId`.
- Rejects (409) when `messageId` isn't the chat's current last message
  (either because it's not last, or because the last message is a `user`
  role — e.g. a turn that previously errored).
- 404 for a `chatId` that doesn't exist or isn't the caller's.
- An aborted/errored regenerate leaves the original assistant row in place
  (mirrors the existing abort/error persistence test for `runChatStream`,
  if one exists — otherwise this is the first coverage of that branch for
  either path).

## Later (explicitly deferred)

- Regenerating any message other than the last (needs the truncate-history
  wire-protocol change called out in `specs/chat/chat-message-persistence.md`
  and `specs/chat/branching.md`'s Later section).
- Edit-and-resend for user messages, likely built on the same truncation
  primitive as the above.
- Keeping regenerated versions and a switcher UI (`MessageBranch*.vue` is
  sitting ready for this, per `specs/chat/branching.md`).
- Picking a different model for a regenerated reply.
