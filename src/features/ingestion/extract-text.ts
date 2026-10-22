import {
  type DocumentFileType,
} from '@/types/domain';
import {
  type ExtractedDocument,
  type ExtractedPage,
  type ExtractedHeading,
} from './types';

export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

/**
 * Configure pdfjs-dist worker source for browser environment.
 */
async function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')): Promise<void> {
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
}

/**
 * Extract text and structural metadata from a plain text or Markdown buffer.
 */
export function extractTextFromBuffer(
  buffer: Uint8Array | ArrayBuffer,
  fileType: 'txt' | 'md',
  filename: string,
): ExtractedDocument {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let rawText: string;

  try {
    rawText = decoder.decode(bytes);
  } catch (err) {
    throw new IngestionError(
      `Failed to decode file "${filename}" as valid UTF-8 text.`,
      'CORRUPT_FILE',
      err,
    );
  }

  // Strip Byte Order Mark (BOM) if present
  if (rawText.charCodeAt(0) === 0xfeff || rawText.charCodeAt(0) === 0xfffe) {
    rawText = rawText.slice(1);
  }

  const headings: ExtractedHeading[] = [];
  if (fileType === 'md') {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(rawText)) !== null) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        charOffset: match.index,
      });
    }
  }

  return {
    filename,
    fileType,
    rawText,
    headings: headings.length > 0 ? headings : undefined,
    metadata: {
      charCount: rawText.length,
      lineCount: rawText.split('\n').length,
    },
  };
}

/**
 * Extract page-by-page text and metadata from a PDF ArrayBuffer using pdfjs-dist.
 */
export async function extractTextFromPdf(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
  onProgress?: (currentPage: number, totalPages: number) => void,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  let pdfjs: typeof import('pdfjs-dist');
  try {
    pdfjs = await import('pdfjs-dist');
    await configurePdfWorker(pdfjs);
  } catch (err) {
    throw new IngestionError(
      'Failed to initialize PDF extraction module.',
      'UNSUPPORTED_FORMAT',
      err,
    );
  }

  // Never execute document scripts
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  // Track password / encryption errors
  loadingTask.onPassword = () => {
    throw new IngestionError(
      'This PDF is password-protected or encrypted. Please decrypt or unlock it before uploading.',
      'PDF_ENCRYPTED',
    );
  };

  let pdfDoc: import('pdfjs-dist').PDFDocumentProxy;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled by user.', 'CANCELLED');
    }
    const errMessage = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : '';
    if (
      errName === 'PasswordException' ||
      errMessage.toLowerCase().includes('password') ||
      errMessage.toLowerCase().includes('encrypted')
    ) {
      throw new IngestionError(
        'This PDF is password-protected or encrypted. Please decrypt or unlock it before uploading.',
        'PDF_ENCRYPTED',
        err,
      );
    }
    throw new IngestionError(
      `Failed to open PDF document "${filename}": ${errMessage}`,
      'CORRUPT_FILE',
      err,
    );
  }

  const numPages = pdfDoc.numPages;
  if (numPages === 0) {
    throw new IngestionError(
      `PDF document "${filename}" contains 0 pages.`,
      'EMPTY_FILE',
    );
  }

  const pages: ExtractedPage[] = [];
  const textParts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled by user.', 'CANCELLED');
    }

    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract string items from text content
      const pageLines: string[] = [];
      let currentLine = '';

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          const str = item.str;
          if (str.length > 0) {
            if (item.hasEOL) {
              currentLine += (currentLine ? ' ' : '') + str;
              pageLines.push(currentLine);
              currentLine = '';
            } else {
              currentLine += (currentLine ? ' ' : '') + str;
            }
          }
        }
      }
      if (currentLine) {
        pageLines.push(currentLine);
      }

      const pageText = pageLines.join('\n').trim();
      pages.push({
        pageNumber: pageNum,
        text: pageText,
      });

      if (pageText) {
        textParts.push(pageText);
      }

      if (onProgress) {
        onProgress(pageNum, numPages);
      }

      // Yield periodically to keep UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (err) {
      console.warn(`Failed to extract text from page ${pageNum} in ${filename}:`, err);
      pages.push({
        pageNumber: pageNum,
        text: '',
      });
    }
  }

  const fullText = textParts.join('\n\n').trim();

  // Scanned/image-only PDF detection (no extractable digital text layer)
  if (fullText.length === 0) {
    throw new IngestionError(
      'No extractable text found in this PDF. It appears to be a scanned or image-only document. Optical Character Recognition (OCR) is not supported in this version. Please provide a document with a digital text layer.',
      'NO_EXTRACTABLE_TEXT',
    );
  }

  return {
    filename,
    fileType: 'pdf',
    rawText: fullText,
    pages,
    metadata: {
      pageCount: numPages,
    },
  };
}

/**
 * Universal dispatcher to extract text according to file type.
 */
export async function extractDocumentText(
  buffer: ArrayBuffer | Uint8Array,
  fileType: DocumentFileType,
  filename: string,
  onProgress?: (currentPage: number, totalPages: number) => void,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  if (fileType === 'pdf') {
    return extractTextFromPdf(buffer, filename, onProgress, signal);
  }
  return extractTextFromBuffer(buffer, fileType, filename);
}
