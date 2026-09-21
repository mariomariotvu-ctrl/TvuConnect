import { Timestamp } from 'firebase/firestore';
import type { DocumentLink, FilterState } from '../types/documentLink';
import {
  buildGoogleDriveShareUrl,
  type GoogleDriveLibraryFile,
} from './googleDriveClient';

export const TVU_DRIVE_LIBRARY_OWNER = 'tvu-drive-library';

const normalized = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd');

export function inferDriveDocumentCategory(file: Pick<GoogleDriveLibraryFile, 'name' | 'mimeType'>): string {
  const name = normalized(file.name);
  if (/\b(de thi|kiem tra|quiz|exam)\b/.test(name)) return 'Đề thi';
  if (/\b(bai tap|exercise|workbook)\b/.test(name)) return 'Bài tập';
  if (/\b(slide|presentation|bai giang)\b/.test(name)
    || file.mimeType.includes('presentation')
    || file.mimeType.includes('powerpoint')) return 'Slide bài giảng';
  if (/\b(giao trinh|textbook)\b/.test(name)) return 'Giáo trình';
  if (/\b(sach|ebook|book)\b/.test(name) || file.mimeType === 'application/pdf') return 'Sách PDF';
  return 'Tài liệu tham khảo';
}

const cleanTitle = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || name;

export function driveFileToDocumentLink(file: GoogleDriveLibraryFile): DocumentLink {
  const modified = new Date(file.modifiedTime || file.createdTime || Date.now());
  const folderPath = file.folderPath.filter((part) => !/^0\./.test(part.trim()));
  const subject = folderPath.at(-1) || 'Học liệu chung';

  return {
    id: `drive-${file.id}`,
    title: cleanTitle(file.name),
    major_id: 'Học liệu TVU',
    subject,
    category: inferDriveDocumentCategory(file),
    url: buildGoogleDriveShareUrl(file),
    description: file.description?.trim()
      || (folderPath.length ? `Trong thư mục ${folderPath.join(' / ')}` : 'Tài liệu từ thư viện chung TVU Connect.'),
    createdAt: Timestamp.fromDate(Number.isNaN(modified.getTime()) ? new Date() : modified),
    createdBy: TVU_DRIVE_LIBRARY_OWNER,
    source: 'google_drive',
    mimeType: file.mimeType,
    folderPath,
  };
}

export function matchesDocumentFilters(document: DocumentLink, filters: FilterState): boolean {
  return (!filters.major_id || document.major_id === filters.major_id)
    && (!filters.subject || document.subject === filters.subject)
    && (!filters.category || document.category === filters.category);
}

export function isExternalGoogleDriveDocument(document: DocumentLink): boolean {
  if (document.source === 'google_drive') return false;
  try {
    const host = new URL(document.url).hostname.toLowerCase();
    return host === 'drive.google.com' || host === 'docs.google.com';
  } catch {
    return false;
  }
}
