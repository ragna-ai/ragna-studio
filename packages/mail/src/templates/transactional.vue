<script setup lang="ts">
const {
  locale = 'de',
  preheader = '',
  heading = '',
  paragraphs = [],
  action,
  recipientLine,
} = defineConfig({});
</script>

<!--
  Mobile values are the base, desktop values sit behind the `desktop:` media query.
  Outlook for Windows ignores media queries, so the desktop values are repeated as
  inline `mso-*-alt` properties, which only Outlook reads.
-->
<template>
  <Html :lang="locale">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
    </Head>
    <Body class="m-0 bg-canvas p-0 dark:bg-canvas-dark">
      <Preheader>{{ preheader }}</Preheader>
      <Tailwind>
        <template #config>
          @import "@maizzle/tailwindcss" source(none); @custom-variant desktop (@media (min-width:
          600px)); @theme { --font-sans: Arial, Helvetica, sans-serif; --color-canvas: #f5f0e6;
          --color-canvas-dark: #0f2a33; --color-surface: #fcfaf5; --color-surface-dark: #173843;
          --color-line: #e3daca; --color-line-dark: #24495a; --color-fg: #1b2326; --color-fg-dark:
          #f5f0e6; --color-muted: #5c6668; --color-muted-dark: #9db2b6; --color-action: #17707f;
          --color-action-dark: #7fc8cf; --color-on-action: #ffffff; --color-on-action-dark: #0f2a33;
          --text-wordmark: 19px; --text-wordmark--line-height: 28px; --text-heading: 28px;
          --text-heading--line-height: 34px; --text-body: 17px; --text-body--line-height: 28px;
          --text-button: 16px; --text-button--line-height: 20px; --text-small: 14px;
          --text-small--line-height: 24px; }
        </template>

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          class="bg-canvas font-sans dark:bg-canvas-dark"
        >
          <tr>
            <td align="center" class="py-8 desktop:px-6 desktop:py-12 mso-padding-alt-[48px_24px]">
              <Outlook
                open='<table role="presentation" width="552" cellpadding="0" cellspacing="0"><tr><td>'
              />
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                class="max-w-[552px]"
              >
                <tr>
                  <td class="px-6 pb-6 desktop:px-12 desktop:pb-8 mso-padding-alt-[0_48px_32px]">
                    <p
                      class="m-0 whitespace-nowrap text-wordmark font-bold text-fg dark:text-fg-dark"
                    >
                      RAGNA
                      <span class="font-normal text-muted dark:text-muted-dark">Studio</span>
                    </p>
                  </td>
                </tr>

                <tr>
                  <td
                    class="border-x-0 border-y border-solid border-line bg-surface px-6 py-8 text-left desktop:rounded-[16px] desktop:border-x desktop:p-12 dark:border-line-dark dark:bg-surface-dark mso-padding-alt-12 [mso-border-alt:solid_#e3daca_1px]"
                  >
                    <h1
                      class="m-0 text-heading font-semibold tracking-[-0.28px] text-fg dark:text-fg-dark"
                    >
                      {{ heading }}
                    </h1>
                    <p
                      v-for="(paragraph, index) in paragraphs"
                      :key="index"
                      class="m-0 mt-4 text-body text-fg dark:text-fg-dark"
                    >
                      {{ paragraph }}
                    </p>

                    <template v-if="action">
                      <NotOutlook>
                        <table
                          role="presentation"
                          cellpadding="0"
                          cellspacing="0"
                          class="mt-8 w-full desktop:w-auto"
                        >
                          <tr>
                            <td class="rounded-full bg-action text-center dark:bg-action-dark">
                              <a
                                :href="action.url"
                                class="block rounded-full bg-action px-6 py-[14px] text-button font-semibold text-on-action no-underline dark:bg-action-dark dark:text-on-action-dark"
                              >
                                {{ action.label }}
                              </a>
                            </td>
                          </tr>
                        </table>
                      </NotOutlook>
                      <Outlook>
                        <table role="presentation" cellpadding="0" cellspacing="0">
                          <tr>
                            <td class="pt-8">
                              <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td class="bg-action text-center mso-padding-alt-[14px_24px]">
                                    <a
                                      :href="action.url"
                                      class="text-button font-semibold text-on-action no-underline"
                                    >
                                      {{ action.label }}
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </Outlook>
                    </template>
                  </td>
                </tr>

                <tr v-if="recipientLine">
                  <td class="px-6 pt-6 desktop:px-12 desktop:pt-8 mso-padding-alt-[32px_48px_0]">
                    <p class="m-0 text-small tracking-[0.14px] text-muted dark:text-muted-dark">
                      {{ recipientLine.beforeAddress
                      }}<span class="whitespace-nowrap">{{ recipientLine.address }}</span
                      >{{ recipientLine.afterAddress }}
                    </p>
                  </td>
                </tr>
              </table>
              <Outlook close="</td></tr></table>" />
            </td>
          </tr>
        </table>
      </Tailwind>
    </Body>
  </Html>
</template>
