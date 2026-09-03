import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { DocumentFormData, DocumentLink, FilterState } from '../types/documentLink';
import { sanitizeURL } from '../utils/urlValidation';

/**
 * Handle Firestore errors with user-friendly messages
 */
function handleFirestoreError(error: any, operation: string): never {
  console.error(`Firestore ${operation} error:`, error);

  if (error.code === 'permission-denied') {
    throw new Error('Bạn không có quyền thực hiện thao tác này');
  }

  if (error.code === 'unavailable' || error.message?.includes('network')) {
    throw new Error('Không thể kết nối. Vui lòng kiểm tra mạng');
  }

  if (error.code === 'resource-exhausted') {
    throw new Error('Hệ thống đang bận. Vui lòng thử lại sau');
  }

  if (error.code === 'not-found') {
    throw new Error('Tài liệu không tồn tại hoặc đã bị xóa');
  }

  // Generic error
  throw new Error('Đã xảy ra lỗi. Vui lòng thử lại');
}

/**
 * Create a new document link
 * @param data - Document form data
 * @param userId - Current user's UID
 * @returns Document ID
 */
export async function createDocument(
  data: DocumentFormData, 
  userId: string
): Promise<string> {
  try {
    const sanitizedURL = sanitizeURL(data.url);
    
    const docRef = await addDoc(collection(db, 'documentLinks'), {
      title: data.title,
      major_id: data.major_id,
      subject: data.subject || '', // Allow empty string for optional field
      category: data.category || '', // Allow empty string for optional field
      url: sanitizedURL,
      description: data.description || '', // Allow empty string
      createdAt: serverTimestamp(),
      createdBy: userId
    });

    return docRef.id;
  } catch (error) {
    return handleFirestoreError(error, 'create');
  }
}

/**
 * Update an existing document link
 * @param id - Document ID
 * @param data - Partial document data to update
 */
export async function updateDocument(
  id: string, 
  data: Partial<DocumentFormData>
): Promise<void> {
  try {
    const docRef = doc(db, 'documentLinks', id);
    const updateData: any = {
      ...data,
      updatedAt: serverTimestamp()
    };

    // Sanitize URL if provided
    if (data.url) {
      updateData.url = sanitizeURL(data.url);
    }

    await updateDoc(docRef, updateData);
  } catch (error) {
    return handleFirestoreError(error, 'update');
  }
}

/**
 * Delete a document link
 * @param id - Document ID
 */
export async function deleteDocument(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'documentLinks', id);
    await deleteDoc(docRef);
  } catch (error) {
    return handleFirestoreError(error, 'delete');
  }
}

/**
 * Get documents with filters
 * @param filters - Filter state
 * @param limitCount - Maximum number of documents to fetch
 * @returns Array of document links
 */
export async function getDocuments(
  filters: FilterState, 
  limitCount: number = 20
): Promise<DocumentLink[]> {
  try {
    let q = query(
      collection(db, 'documentLinks'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
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

    const querySnapshot = await getDocs(q);
    const documents: DocumentLink[] = [];

    querySnapshot.forEach((doc) => {
      documents.push({
        id: doc.id,
        ...doc.data()
      } as DocumentLink);
    });

    return documents;
  } catch (error) {
    return handleFirestoreError(error, 'fetch');
  }
}
