import React, { useState } from 'react';
import { seedPlaces } from '../utils/seedPlaces';
import { Database } from 'lucide-react';
import { toast } from 'sonner';

export const SeedPlacesButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const handleSeed = async () => {
    if (seeded) {
      toast.info('Dữ liệu đã được thêm rồi!');
      return;
    }

    const confirmed = window.confirm(
      '⚠️ Bạn có chắc muốn thêm 10 địa điểm mẫu vào database?\n\n' +
      'Chỉ nên chạy 1 lần duy nhất!'
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await seedPlaces();
      if (result.success) {
        toast.success(`✅ Đã thêm ${result.count} địa điểm thành công!`);
        setSeeded(true);
        // Save to localStorage to prevent re-seeding
        localStorage.setItem('places_seeded', 'true');
      } else {
        toast.error('❌ Có lỗi xảy ra khi thêm dữ liệu');
      }
    } catch (error) {
      console.error('Seed error:', error);
      toast.error('❌ Lỗi: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Check if already seeded
  React.useEffect(() => {
    const alreadySeeded = localStorage.getItem('places_seeded');
    if (alreadySeeded === 'true') {
      setSeeded(true);
    }
  }, []);

  if (seeded) {
    return null; // Don't show anything when seeded
  }

  return (
    <button
      onClick={handleSeed}
      disabled={loading}
      className="fixed bottom-4 right-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed animate-pulse hover:animate-none"
      style={{ zIndex: 9999 }}
    >
      <Database className="w-5 h-5" />
      {loading ? 'Đang thêm...' : '🎯 Thêm 10 địa điểm mẫu'}
    </button>
  );
};
