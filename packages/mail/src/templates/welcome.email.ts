import mjml2html from 'mjml';

/*
  Compile an mjml string
*/
export async function renderMjml() {
  const htmlOutput = await mjml2html(
    `
    <mjml>
      <mj-body>
        <mj-section>
          <mj-column>
            <mj-text>
              Hello World!
            </mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `,
  );
}

// async function example() {
//     const { html } = await mjml(input, {
//         minify: true,
//         sanitizeStyles: true,
//         templateS­yntax: [
//             { prefix: '{{', suffix: '}}' },
//             { prefix: '[[', suffix: ']]' },
//         ],
//         allowMixedSyntax: false, // set true to allow block + CSS tokens together
//         // Disable CSS minify if your tokens are broken or your minifier cannot parse them:
//         minifyOptions: { minifyCss: false },
//     })
//     // use html variable
// }
