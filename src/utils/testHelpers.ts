// Test Helpers and Utilities for TVU Connect

export const mockUser = {
  uid: 'test-user-123',
  email: 'test@tvu.edu.vn',
  displayName: 'Test User',
  photoURL: 'https://via.placeholder.com/150'
};

export const mockProfile = {
  uid: 'test-user-123',
  email: 'test@tvu.edu.vn',
  fullName: 'Nguyễn Văn Test',
  gender: 'male' as const,
  age: 20,
  major: 'Công nghệ thông tin',
  academicYear: '2021-2025',
  interests: ['Đá bóng', 'Đọc sách'],
  photoURL: 'https://via.placeholder.com/150',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockFirestoreDoc = (data: any) => ({
  id: 'mock-id',
  data: () => data,
  exists: () => true
});

export const mockFirestoreCollection = (docs: any[]) => ({
  docs: docs.map(mockFirestoreDoc),
  empty: docs.length === 0,
  size: docs.length
});

// Performance testing
export const measureRenderTime = async (component: () => void): Promise<number> => {
  const start = performance.now();
  component();
  await wait(0); // Wait for next tick
  const end = performance.now();
  return end - start;
};

// Memory testing
export const getMemoryUsage = (): number | null => {
  if ('memory' in performance) {
    return (performance as any).memory.usedJSHeapSize / 1048576; // MB
  }
  return null;
};
