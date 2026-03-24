/**
 * Storage Service — Course Cover Image Uploads
 *
 * Wraps Firebase Storage for course cover images.
 * Deterministic path: courses/{courseId}/cover.{ext} — re-uploads overwrite.
 *
 * @module services/storageService
 */
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export class InvalidFileTypeError extends Error {
  constructor() {
    super('Only JPEG and PNG files are allowed.');
    this.name = 'InvalidFileTypeError';
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super('File size exceeds 20 MB limit.');
    this.name = 'FileTooLargeError';
  }
}

export async function uploadCourseImage(
  courseId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new InvalidFileTypeError();
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new FileTooLargeError();
  }

  const ext = EXT_MAP[file.type] || 'jpg';
  const storagePath = `courses/${courseId}/cover.${ext}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise<UploadResult>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress?.(percent);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ downloadUrl, storagePath });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
