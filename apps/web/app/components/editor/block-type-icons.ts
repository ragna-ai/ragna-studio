import {
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  TextIcon,
  TextQuoteIcon,
} from '@lucide/vue';
import type { BlockType } from '@repo/editor';
import type { Component } from 'vue';

export const BLOCK_TYPE_ICONS: Readonly<Record<BlockType, Component>> = {
  paragraph: TextIcon,
  h1: Heading1Icon,
  h2: Heading2Icon,
  h3: Heading3Icon,
  h4: Heading4Icon,
  bulletList: ListIcon,
  orderedList: ListOrderedIcon,
  taskList: ListChecksIcon,
  blockquote: TextQuoteIcon,
  codeBlock: Code2Icon,
};
