<script setup lang="ts">
const props = defineProps<{
  html: string;
}>();

const iframe = ref<HTMLIFrameElement | null>(null);
const iframeHeight = ref(0);

let resizeObserver: ResizeObserver | undefined;

// Senders style dark mode via `@media (prefers-color-scheme: dark)`, which the browser
// matches against the OS/browser theme. We always want light, so disarm it here.
function forceLightMode(html: string): string {
  return html.replace(
    /prefers-color-scheme\s*:\s*dark/gi,
    'prefers-color-scheme: light',
  );
}

const iframeHtml = computed(() => {
  const { headHtml, bodyHtml } = sanitizeHtmlForIframe(props.html);

  return `
    <!doctype html>
    <html>
      <head>
        <meta
          http-equiv="Content-Security-Policy"
          content="
            default-src 'none';
            script-src 'none';
            connect-src 'none';
            object-src 'none';
            base-uri 'none';
            form-action 'none';
            frame-src 'none';
            worker-src 'none';
            media-src 'none';
            manifest-src 'none';
            img-src https: cid: data:;
            font-src https:;
            style-src 'unsafe-inline';
          "
        >
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <!-- Defensive layout CSS; email-provided CSS can still override this. -->
        <style>
          html,
          body {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            max-width: 100%;
            overflow: hidden;
            overflow-wrap: break-word;
            color-scheme: light;
          }
          body {
            font-family:
              Inter,
              ui-sans-serif,
              system-ui,
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              Roboto,
              Arial,
              sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #111827;
          }            
          *,
          *::before,
          *::after {
            box-sizing: border-box;
          }
        </style>
        <!-- Sender-provided head content (e.g. newsletter <style> rules); can override the defensive CSS above. -->
        ${forceLightMode(headHtml)}
      </head>
      <body>${forceLightMode(bodyHtml)}</body>
    </html>
  `;
});

function updateHeight() {
  const doc = iframe.value?.contentDocument;
  if (!doc) return;

  iframeHeight.value = Math.max(
    doc.body.scrollHeight,
    doc.documentElement.scrollHeight,
    doc.body.offsetHeight,
    doc.documentElement.offsetHeight,
  );
}

function onIframeLoad() {
  resizeObserver?.disconnect();

  const doc = iframe.value?.contentDocument;
  if (!doc) return;

  updateHeight();

  // Also handles late-loading images and layout changes.
  resizeObserver = new ResizeObserver(updateHeight);
  resizeObserver.observe(doc.documentElement);
  resizeObserver.observe(doc.body);
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <iframe
    ref="iframe"
    :srcdoc="iframeHtml"
    :style="{
      width: '100%',
      height: `${iframeHeight}px`,
      border: '0',
    }"
    allow="
      geolocation 'none';
      camera 'none';
      microphone 'none';
      payment 'none';
      usb 'none';
    "
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    title="Email content"
    @load="onIframeLoad"
  />
</template>
