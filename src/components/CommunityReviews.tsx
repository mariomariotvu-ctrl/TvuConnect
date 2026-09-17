import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { Loader2, Send, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CommunityReview, CommunityReviewTarget } from '../types';
import {
  deleteCommunityReview,
  saveCommunityReview,
  subscribeToCommunityReviews,
} from '../services/communityReviewService';

interface CommunityReviewsProps {
  targetKind: CommunityReviewTarget;
  targetId: string;
  currentUser: User;
}

const reviewDate = (value: unknown) => {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toLocaleDateString('vi-VN');
  }
  return '';
};

export const CommunityReviews: React.FC<CommunityReviewsProps> = ({
  targetKind,
  targetId,
  currentUser,
}) => {
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToCommunityReviews(targetKind, targetId, (nextReviews) => {
    setReviews(nextReviews);
    setLoading(false);
    const mine = nextReviews.find((review) => review.userId === currentUser.uid);
    if (mine) {
      setRating(mine.rating);
      setContent(mine.content);
    }
  }, (error) => {
    console.error('Could not load community reviews:', error);
    setLoading(false);
    toast.error('Chưa thể tải đánh giá.');
  }), [currentUser.uid, targetId, targetKind]);

  const average = useMemo(() => (
    reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0
  ), [reviews]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (content.trim().length < 5) {
      toast.error('Đánh giá cần ít nhất 5 ký tự.');
      return;
    }
    setSaving(true);
    try {
      await saveCommunityReview({
        targetKind,
        targetId,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Sinh viên TVU',
        userAvatar: currentUser.photoURL || undefined,
        rating,
        content,
      });
      toast.success('Đã lưu đánh giá của bạn.');
    } catch (error) {
      console.error('Could not save review:', error);
      toast.error('Không thể lưu đánh giá.');
    } finally {
      setSaving(false);
    }
  };

  const removeMine = async () => {
    try {
      await deleteCommunityReview(targetKind, targetId, currentUser.uid);
      setContent('');
      setRating(5);
      toast.success('Đã xóa đánh giá.');
    } catch (error) {
      console.error('Could not delete review:', error);
      toast.error('Không thể xóa đánh giá.');
    }
  };

  return (
    <section className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-slate-900 dark:text-white">Đánh giá sinh viên</h3>
        <span className="text-sm font-bold text-amber-600 inline-flex items-center gap-1">
          <Star className="w-4 h-4 fill-current" /> {reviews.length ? average.toFixed(1) : 'Mới'} · {reviews.length}
        </span>
      </div>

      <form onSubmit={submit} className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
        <div className="flex gap-1" aria-label="Chọn số sao">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} sao`}>
              <Star className={`w-6 h-6 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={targetKind === 'rental' ? 'Chia sẻ về giá, an ninh, chủ trọ, điện nước…' : 'Chia sẻ món ngon, mức giá, phục vụ, không gian…'}
          className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-white resize-none"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          {reviews.some((review) => review.userId === currentUser.uid) ? (
            <button type="button" onClick={() => void removeMine()} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Xóa đánh giá</button>
          ) : <span />}
          <button disabled={saving} type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Lưu đánh giá
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : reviews.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có đánh giá. Bạn có thể là người đầu tiên chia sẻ trải nghiệm thật.</p>
        ) : reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center font-black text-indigo-700 dark:text-indigo-200">
                  {review.userAvatar ? <img src={review.userAvatar} alt="" className="w-full h-full object-cover" /> : review.userName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0"><p className="font-bold text-sm text-slate-900 dark:text-white truncate">{review.userName}</p><p className="text-[11px] text-slate-400">{reviewDate(review.updatedAt || review.createdAt)}</p></div>
              </div>
              <span className="text-xs font-black text-amber-600">★ {review.rating}/5</span>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">{review.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
