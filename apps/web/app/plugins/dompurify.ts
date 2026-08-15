import DOMPurify from 'isomorphic-dompurify';
import type { Directive } from 'vue';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A' || !node.hasAttribute('href')) {
    return;
  }
  // Open external links in a new tab/window.
  node.setAttribute('target', '_blank');
  // Prevent the opened page from accessing window.opener.
  node.setAttribute('rel', 'noopener noreferrer');
});

const sanitizeHtmlDirective: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.innerHTML = DOMPurify.sanitize(binding.value);
  },

  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.innerHTML = DOMPurify.sanitize(binding.value);
    }
  },
};

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('sanitize-html', sanitizeHtmlDirective);
});
