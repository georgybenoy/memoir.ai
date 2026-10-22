import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_EXTENSIONS,
  formatBytes,
} from '@/lib/config/ingestion';
import { type DocumentFileType } from '@/types/domain';
import { type FileValidationResult } from './types';

/**
 * Validate file metadata, extension, size, and magic byte signature.
 * Enforces strict security constraints before attempting text extraction.
 */
export function validateUploadFile(
  filename: string,
  byteSize: number,
  declaredMimeType?: string,
  headerBuffer?: Uint8Array,
): FileValidationResult {
  // 1. Check for empty file
  if (byteSize <= 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      error: `File "${filename}" is empty (0 bytes).`,
      filename,
      sizeBytes: byteSize,
    };
  }

  // 2. Check size bounds
  if (byteSize > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      error: `File "${filename}" (${formatBytes(byteSize)}) exceeds the maximum allowed upload size of ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      filename,
      sizeBytes: byteSize,
    };
  }

  // 3. Resolve extension
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return {
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      error: `File "${filename}" has no file extension. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
      filename,
      sizeBytes: byteSize,
    };
  }

  const ext = filename.slice(lastDot).toLowerCase();
  let fileType: DocumentFileType | undefined;

  if (ext === '.pdf') {
    fileType = 'pdf';
  } else if (ext === '.txt') {
    fileType = 'txt';
  } else if (ext === '.md') {
    fileType = 'md';
  } else {
    return {
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      error: `File extension "${ext}" is not supported. Please upload a PDF, TXT, or Markdown (.md) document.`,
      filename,
      sizeBytes: byteSize,
    };
  }

  // 4. Inspect file signature / magic bytes if headerBuffer provided
  if (headerBuffer && headerBuffer.length > 0) {
    if (fileType === 'pdf') {
      // PDF specification requires %PDF- (0x25 0x50 0x44 0x46 0x2D) within first 1024 bytes
      const maxScan = Math.min(headerBuffer.length, 1024);
      let found = false;
      for (let i = 0; i <= maxScan - 5; i++) {
        if (
          headerBuffer[i] === 0x25 && // %
          headerBuffer[i + 1] === 0x50 && // P
          headerBuffer[i + 2] === 0x44 && // D
          headerBuffer[i + 3] === 0x46 && // F
          headerBuffer[i + 4] === 0x2d // -
        ) {
          found = true;
          break;
        }
      }

      if (!found) {
        return {
          valid: false,
          code: 'SIGNATURE_MISMATCH',
          error: `File "${filename}" has a .pdf extension but is not a valid PDF document (missing %PDF- header).`,
          fileType,
          filename,
          sizeBytes: byteSize,
        };
      }
    } else {
      // TXT / MD: Must not contain NUL bytes (0x00) and must decode as UTF-8
      const sampleLimit = Math.min(headerBuffer.length, 8192);
      for (let i = 0; i < sampleLimit; i++) {
        if (headerBuffer[i] === 0x00) {
          return {
            valid: false,
            code: 'SIGNATURE_MISMATCH',
            error: `File "${filename}" contains binary data (NUL bytes) and cannot be parsed as plain text or Markdown.`,
            fileType,
            filename,
            sizeBytes: byteSize,
          };
        }
      }

      // Verify UTF-8 decoding
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(headerBuffer.slice(0, sampleLimit));
      } catch {
        return {
          valid: false,
          code: 'CORRUPT_FILE',
          error: `File "${filename}" contains invalid UTF-8 byte sequences.`,
          fileType,
          filename,
          sizeBytes: byteSize,
        };
      }
    }
  }

  return {
    valid: true,
    fileType,
    mimeType: declaredMimeType,
    sizeBytes: byteSize,
    filename,
  };
}
