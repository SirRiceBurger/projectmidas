import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href;

export async function extractText(
  file: File,
): Promise<{ text: string; pageCount?: number }> {
  const lower = file.name.toLowerCase();
  const mime = file.type;

  // PDF
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;
      const pageTexts: string[] = [];
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => {
            if ('str' in item) return item.str;
            return '';
          })
          .join(' ');
        pageTexts.push(pageText);
      }
      return { text: pageTexts.join('\n\n'), pageCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `[PDF extraction failed for ${file.name}: ${msg}]`,
        pageCount: undefined,
      };
    }
  }

  // DOCX
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { text: result.value };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `[DOCX extraction failed for ${file.name}: ${msg}]`,
        pageCount: undefined,
      };
    }
  }

  // Plain text formats
  if (
    mime.startsWith('text/') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.json') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.log')
  ) {
    try {
      const text = await file.text();
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `[Text extraction failed for ${file.name}: ${msg}]`,
      };
    }
  }

  // Fallback for unsupported types
  return {
    text: `[File: ${file.name} — content not extractable. File stored for reference.]`,
    pageCount: undefined,
  };
}
