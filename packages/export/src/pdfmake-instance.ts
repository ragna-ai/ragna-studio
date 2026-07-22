import pdfMake from 'pdfmake';
// pdfmake ships this compiled vfs alongside its own JS; requiring it directly
// gives us the Roboto font bytes without adding any font files to this repo.
import vfsFonts from 'pdfmake/build/vfs_fonts.js';

// Shared pdfmake singleton for every PDF writer in this package (dataset
// export and document export): fonts and the virtual file system below are
// process-wide state, so they're registered once, here, rather than once per
// writer module.

// `pdfMake.createPdf`'s parameter type isn't re-exported by name from
// 'pdfmake' (only via the internal 'pdfmake/interfaces' path), so it's
// derived here instead of importing an undocumented subpath.
export type PdfDocumentDefinition = Parameters<typeof pdfMake.createPdf>[0];
export type PdfContent = PdfDocumentDefinition['content'];

// pdfmake resolves a font descriptor that's a plain object (as opposed to a
// string filename) as a `{ url, headers }` remote font and crashes on one
// that isn't (`Printer.js#resolveUrls`), so a `Buffer` can't be passed as a
// font source directly despite `@types/pdfmake` allowing it. The supported
// path is registering the bytes in pdfmake's virtual file system and
// referencing them by filename. That filesystem isn't part of the public
// `pdfmake` types (only the Node-unsupported `addVirtualFileSystem` is), so
// this is a narrow, honest local type for the one method used here.
interface PdfMakeVirtualFileSystem {
  writeFileSync(fileName: string, content: string, encoding: 'base64'): void;
}

const virtualFileSystem = (pdfMake as unknown as { virtualfs: PdfMakeVirtualFileSystem }).virtualfs;

const ROBOTO_FONT_FILES = {
  normal: 'Roboto-Regular.ttf',
  bold: 'Roboto-Medium.ttf',
  italics: 'Roboto-Italic.ttf',
  bolditalics: 'Roboto-MediumItalic.ttf',
} as const;

// Registered once per process: pdfmake's virtual file system and fonts are
// both singletons, and the bundled Roboto vfs data never changes at runtime.
for (const fileName of Object.values(ROBOTO_FONT_FILES)) {
  virtualFileSystem.writeFileSync(fileName, vfsFonts[fileName], 'base64');
}

// Courier is one of PDFKit's built-in standard-14 fonts (referenced by name,
// not a file), used for code blocks in the document PDF writer. Passing its
// name through `setFonts` is safe for the same reason a vfs filename is: the
// value is a string, so `resolveUrls` (see above) never mistakes it for a
// remote font descriptor.
pdfMake.setFonts({
  Roboto: ROBOTO_FONT_FILES,
  Courier: {
    normal: 'Courier',
    bold: 'Courier-Bold',
    italics: 'Courier-Oblique',
    bolditalics: 'Courier-BoldOblique',
  },
});

export default pdfMake;
