import { query, collection, where, orderBy, limit, Query } from 'firebase/firestore';
import { db } from '../firebase';
import { FilterState, DocumentLink } from '../types/documentLink';

/**
 * Build Firestore query based on filter state
 * @param filters - Current filter state
 * @param pageSize - Number of documents per page
 * @returns Firestore query
 */
export function buildFirestoreQuery(
  filters: FilterState, 
  pageSize: number = 20
): Query {
  let q = query(
    collection(db, 'documentLinks'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  // Add filter conditions
  if (filters.major_id) {
    q = query(q, where('major_id', '==', filters.major_id));
  }
  if (filters.subject) {
    q = query(q, where('subject', '==', filters.subject));
  }
  if (filters.category) {
    q = query(q, where('category', '==', filters.category));
  }

  return q;
}

// Major name mapping for smart search
const MAJOR_SEARCH_MAP: Record<string, string[]> = {
  'duoc-hoc': ['dược', 'duoc', 'dược học', 'duoc hoc', 'pharmacy'],
  'cntt': ['cntt', 'công nghệ thông tin', 'cong nghe thong tin', 'it', 'information technology'],
  'ai': ['ai', 'trí tuệ nhân tạo', 'tri tue nhan tao', 'artificial intelligence'],
  'y-da-khoa': ['y', 'y đa khoa', 'y da khoa', 'medicine', 'bác sĩ', 'bac si'],
  'rang-ham-mat': ['răng', 'rang', 'răng hàm mặt', 'rang ham mat', 'nha khoa', 'dentistry'],
  'dieu-duong': ['điều dưỡng', 'dieu duong', 'nursing', 'y tá', 'y ta'],
  'y-hoc-du-phong': ['y học dự phòng', 'y hoc du phong', 'preventive medicine', 'public health'],
  'xet-nghiem-y-hoc': ['xét nghiệm', 'xet nghiem', 'medical laboratory'],
  'thu-y': ['thú y', 'thu y', 'veterinary'],
  'co-khi': ['cơ khí', 'co khi', 'mechanical'],
  'dien-dien-tu': ['điện', 'dien', 'điện tử', 'dien tu', 'electrical', 'electronic'],
  'co-dien-tu': ['cơ điện tử', 'co dien tu', 'mechatronics'],
  'xay-dung': ['xây dựng', 'xay dung', 'civil engineering', 'construction'],
  'thuc-pham': ['thực phẩm', 'thuc pham', 'food technology'],
  'moi-truong': ['môi trường', 'moi truong', 'environmental'],
  'sinh-hoc': ['sinh học', 'sinh hoc', 'biotechnology', 'biology'],
  'quan-tri-kinh-doanh': ['quản trị', 'quan tri', 'kinh doanh', 'business', 'management'],
  'ke-toan': ['kế toán', 'ke toan', 'accounting'],
  'tai-chinh-ngan-hang': ['tài chính', 'tai chinh', 'ngân hàng', 'ngan hang', 'finance', 'banking'],
  'luat': ['luật', 'luat', 'law'],
  'quan-ly-nha-nuoc': ['quản lý nhà nước', 'quan ly nha nuoc', 'public administration'],
  'du-lich': ['du lịch', 'du lich', 'tourism'],
  'su-pham-tieu-hoc': ['sư phạm tiểu học', 'su pham tieu hoc', 'tiểu học', 'tieu hoc', 'primary education'],
  'su-pham-mam-non': ['sư phạm mầm non', 'su pham mam non', 'mầm non', 'mam non', 'preschool'],
  'ngon-ngu-anh': ['anh', 'tiếng anh', 'tieng anh', 'english'],
  'ngon-ngu-trung': ['trung', 'tiếng trung', 'tieng trung', 'chinese'],
  'ngon-ngu-khmer': ['khmer', 'tiếng khmer', 'tieng khmer']
};

/**
 * Normalize Vietnamese text for search (remove diacritics)
 */
function normalizeVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * Check if keyword matches major
 */
function matchesMajor(majorId: string, keyword: string): boolean {
  const normalizedKeyword = normalizeVietnamese(keyword);
  const searchTerms = MAJOR_SEARCH_MAP[majorId] || [];
  
  return searchTerms.some(term => {
    const normalizedTerm = normalizeVietnamese(term);
    return normalizedTerm.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedTerm);
  });
}

/**
 * Filter documents by keyword (client-side)
 * Smart search in title, description, and major name
 * @param docs - Array of documents
 * @param keyword - Search keyword
 * @returns Filtered documents
 */
export function filterByKeyword(
  docs: DocumentLink[], 
  keyword: string
): DocumentLink[] {
  if (!keyword || keyword.trim() === '') {
    return docs;
  }

  const lowerKeyword = keyword.toLowerCase().trim();
  const normalizedKeyword = normalizeVietnamese(lowerKeyword);
  
  return docs.filter(doc => {
    // Search in title
    const titleMatch = doc.title.toLowerCase().includes(lowerKeyword) ||
                      normalizeVietnamese(doc.title).includes(normalizedKeyword);
    
    // Search in description
    const descriptionMatch = doc.description?.toLowerCase().includes(lowerKeyword) ||
                            normalizeVietnamese(doc.description || '').includes(normalizedKeyword);
    
    // Search in major name
    const majorMatch = matchesMajor(doc.major_id, lowerKeyword);
    
    return titleMatch || descriptionMatch || majorMatch;
  });
}

/**
 * Filter documents by major
 * @param docs - Array of documents
 * @param majorId - Major ID to filter by
 * @returns Filtered documents
 */
export function filterByMajor(
  docs: DocumentLink[], 
  majorId: string | null
): DocumentLink[] {
  if (!majorId) {
    return docs;
  }
  return docs.filter(doc => doc.major_id === majorId);
}

/**
 * Filter documents by subject
 * @param docs - Array of documents
 * @param subject - Subject to filter by
 * @returns Filtered documents
 */
export function filterBySubject(
  docs: DocumentLink[], 
  subject: string | null
): DocumentLink[] {
  if (!subject) {
    return docs;
  }
  return docs.filter(doc => doc.subject === subject);
}

/**
 * Filter documents by category
 * @param docs - Array of documents
 * @param category - Category to filter by
 * @returns Filtered documents
 */
export function filterByCategory(
  docs: DocumentLink[], 
  category: string | null
): DocumentLink[] {
  if (!category) {
    return docs;
  }
  return docs.filter(doc => doc.category === category);
}

/**
 * Apply all filters to documents
 * @param docs - Array of documents
 * @param filters - Filter state
 * @param keyword - Search keyword
 * @returns Filtered documents
 */
export function applyAllFilters(
  docs: DocumentLink[],
  filters: FilterState,
  keyword: string
): DocumentLink[] {
  let filtered = docs;

  // Apply major filter
  filtered = filterByMajor(filtered, filters.major_id);

  // Apply subject filter
  filtered = filterBySubject(filtered, filters.subject);

  // Apply category filter
  filtered = filterByCategory(filtered, filters.category);

  // Apply keyword search
  filtered = filterByKeyword(filtered, keyword);

  return filtered;
}
