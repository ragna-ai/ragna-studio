<script setup lang="ts">
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';

const editor = useEditor({
  content: `<p>I'm running Tiptap with Vue.js. 🎉</p>`,
  extensions: [StarterKit],
  // Don't render on the server, only on the client after hydration
  // immediatelyRender: false,
});
</script>

<template>
  <EditorContent :editor="editor" />
</template>
