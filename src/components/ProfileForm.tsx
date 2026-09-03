import React, { useState, useEffect, useRef } from 'react';
import { db, auth, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, handleFirestoreError, OperationType, onSnapshot } from '../firebase';
import { User } from 'firebase/auth';
import { StudentProfile } from '../types';
import { Save, User as UserIcon, Phone, BookOpen, GraduationCap, Heart, Calendar, FileText, Info, MapPin, Sparkles, ShieldOff, Trash2, X, Loader2, Camera, Upload } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { compressImage, formatFileSize } from '../utils/imageCompression';
import { getCachedData, setCachedData } from '../utils/cacheManager';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';

// Danh sách 63 tỉnh/thành phố Việt Nam
const VIETNAM_PROVINCES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bạc Liêu', 'Bắc Giang', 'Bắc Kạn', 'Bắc Ninh',
  'Bến Tre', 'Bình Dương', 'Bình Định', 'Bình Phước', 'Bình Thuận', 'Cà Mau',
  'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 'Đắk Nông', 'Điện Biên',
  'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội',
  'Hà Tĩnh', 'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên',
  'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn',
  'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An', 'Ninh Bình', 'Ninh Thuận',
  'Phú Thọ', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh',
  'Quảng Trị', 'Sóc Trăng', 'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên',
  'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang',
  'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
];

interface ProfileFormProps {
  user: User;
  onSave: (profile: StudentProfile) => void;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({ user, onSave }) => {
  const { theme } = useTheme();
  const [profile, setProfile] = useState<Partial<StudentProfile>>({
    mssv: '',
    fullName: '',
    className: '',
    phone: '',
    major: '',
    interests: [],
    gender: 'male',
    birthDate: '',
    academicYear: '',
    purpose: '',
    studyGoals: [],
    description: '',
    showPhone: true,
    hometown: '',
    showHometown: true,
    uid: user.uid,
    email: user.email || '',
    photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`,
    age: 0,
    zodiac: '',
  });

  const [interestInput, setInterestInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<StudentProfile[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [isConfirmUnblockOpen, setIsConfirmUnblockOpen] = useState(false);
  const [userToUnblock, setUserToUnblock] = useState<StudentProfile | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calculateZodiac = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth() + 1;

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Bạch Dương';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Kim Ngưu';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Song Tử';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cự Giải';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Sư Tử';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Xử Nữ';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Thiên Bình';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Bọ Cạp';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Nhân Mã';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Ma Kết';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Bảo Bình';
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Song Ngư';
    return '';
  };

  const calculateAge = (dateStr: string) => {
    if (!dateStr) return undefined;
    const birthDate = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  useEffect(() => {
    let isMounted = true;

    // Cache-first: hiển thị dữ liệu cached ngay lập tức để tránh spinner
    const cacheConfig = {
      key: `profile_${user.uid}`,
      ttl: 10 * 60 * 1000, // 10 phút
      storage: 'localStorage' as const,
    };
    const cachedProfile = getCachedData<Partial<StudentProfile>>(cacheConfig);
    if (cachedProfile) {
      setProfile(cachedProfile);
      setLoading(false); // Hiển thị ngay từ cache, không cần spinner
    }

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (!isMounted) return;
        if (docSnap.exists()) {
          const data = docSnap.data() as StudentProfile;
          setProfile(data);
          // Lưu vào cache — strip base64 photoURL để không làm nặng localStorage
          try {
            const dataToCache = { ...data };
            if (dataToCache.photoURL?.startsWith('data:')) {
              delete dataToCache.photoURL;
            }
            setCachedData(cacheConfig, dataToCache);
          } catch (_) {}
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `profiles/${user.uid}`, true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // Timeout fallback: nếu sau 5 giây loading vẫn true thì tự giải phóng
    const loadingTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 5000);

    fetchProfile();

    // Realtime listener cho blocked users list
    setLoadingBlocks(true);
    const blocksQuery = query(
      collection(db, 'blocks'),
      where('blockerUid', '==', user.uid)
    );
    const unsubBlocks = onSnapshot(blocksQuery, async (snap) => {
      if (!isMounted) return;
      const blockedUids = snap.docs.map(d => d.data().blockedUid as string);
      if (blockedUids.length === 0) {
        setBlockedUsers([]);
        setLoadingBlocks(false);
        return;
      }
      try {
        const profilesQuery = query(
          collection(db, 'profiles'),
          where('uid', 'in', blockedUids.slice(0, 30))
        );
        const profileSnap = await getDocs(profilesQuery);
        if (isMounted) {
          setBlockedUsers(profileSnap.docs.map(d => d.data() as StudentProfile));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'profiles', true);
      } finally {
        if (isMounted) setLoadingBlocks(false);
      }
    }, (err) => {
      // Lỗi onSnapshot không được làm kẹt loading chính
      handleFirestoreError(err, OperationType.LIST, 'blocks', true);
      if (isMounted) {
        setLoadingBlocks(false);
        // Đảm bảo loading chính cũng được giải phóng nếu fetchProfile chưa xong
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
      unsubBlocks();
    };
  }, [user.uid]);

  const fetchBlockedUsers = async () => {
    setLoadingBlocks(true);
    try {
      const blocksRef = collection(db, 'blocks');
      const q = query(blocksRef, where('blockerUid', '==', user.uid));
      const querySnapshot = await getDocs(q);

      const blockedUids = querySnapshot.docs.map(doc => doc.data().blockedUid);

      if (blockedUids.length === 0) {
        setBlockedUsers([]);
        return;
      }

      // Fetch all blocked profiles in ONE single query (Max 30)
      const profilesRef = collection(db, 'profiles');
      const profileQuery = query(profilesRef, where('uid', 'in', blockedUids.slice(0, 30)));
      const profileSnapshot = await getDocs(profileQuery);

      const profiles = profileSnapshot.docs.map(doc => doc.data() as StudentProfile);
      setBlockedUsers(profiles);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'blocks', true);
    } finally {
      setLoadingBlocks(false);
    }
  };

  const handleUnblock = async () => {
    if (!userToUnblock) return;
    setUnblockingId(userToUnblock.uid);
    try {
      const blockId = `${user.uid}_${userToUnblock.uid}`;
      await deleteDoc(doc(db, 'blocks', blockId));
      setBlockedUsers(prev => prev.filter(u => u.uid !== userToUnblock.uid));
      setIsConfirmUnblockOpen(false);
      setUserToUnblock(null);
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error('Có lỗi xảy ra khi bỏ chặn. Vui lòng thử lại.');
    } finally {
      setUnblockingId(null);
    }
  };

  // Format Vietnamese name: capitalize first letter of each word
  const formatVietnameseName = (name: string): string => {
    return name
      .trim()
      .split(/\s+/)
      .map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => {
      const newProfile = { ...prev, [name]: value };
      
      // Don't format while typing - only on blur
      
      if (name === 'birthDate') {
        newProfile.zodiac = calculateZodiac(value);
        newProfile.age = calculateAge(value);
      }
      return newProfile;
    });
  };

  // Format name when user leaves the input field
  const handleNameBlur = () => {
    if (profile.fullName) {
      setProfile(prev => ({
        ...prev,
        fullName: formatVietnameseName(prev.fullName || '')
      }));
    }
  };

  const handleAddInterest = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      e.preventDefault();
      if (!profile.interests?.includes(interestInput.trim())) {
        setProfile(prev => ({
          ...prev,
          interests: [...(prev.interests || []), interestInput.trim()]
        }));
      }
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setProfile(prev => ({
      ...prev,
      interests: prev.interests?.filter(i => i !== interest)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastActionTime < 2000) {
      toast.error('Vui lòng đợi 2 giây giữa các lần lưu hồ sơ.');
      return;
    }
    setLastActionTime(now);

    if (!profile.mssv?.trim() || !profile.fullName?.trim()) {
      toast.error('Vui lòng điền Mã số sinh viên và Họ tên.');
      return;
    }

    // Validate required fields
    if (!profile.phone?.trim()) {
      toast.error('Vui lòng điền Số điện thoại để có thể liên lạc qua Zalo.');
      return;
    }

    if (!profile.className?.trim()) {
      toast.error('Vui lòng điền Lớp.');
      return;
    }

    if (!profile.hometown?.trim()) {
      toast.error('Vui lòng điền Quê quán.');
      return;
    }

    if (!profile.major?.trim()) {
      toast.error('Vui lòng điền Ngành học.');
      return;
    }

    // Kiểm tra độ dài tối thiểu - không cho phép viết tắt
    if (profile.major.trim().length < 10) {
      toast.error('Vui lòng viết đầy đủ tên ngành học. Ví dụ: "Công Nghệ Thông Tin" thay vì "CNTT"');
      return;
    }

    if (!profile.academicYear?.trim()) {
      toast.error('Vui lòng điền Niên khóa.');
      return;
    }

    if (!profile.gender) {
      toast.error('Vui lòng chọn Giới tính.');
      return;
    }

    setSaving(true);
    try {
      // Clean profile data: only include fields the rules expect
      const cleanData: Record<string, any> = {
        mssv: profile.mssv?.trim() || '',
        fullName: profile.fullName?.trim() || '',
        uid: user.uid,
        email: user.email || '',
        updatedAt: serverTimestamp(),
      };

      // We use a trick: always send createdAt but the Rules allow it skip if update.
      // Or better: check if we already have it in the local state
      if (!profile.createdAt) {
        cleanData.createdAt = serverTimestamp();
      }

      // Add optional string fields (only if they have a value)
      if (profile.nickname?.trim()) cleanData.nickname = profile.nickname.trim();
      if (profile.className?.trim()) cleanData.className = profile.className.trim();
      if (profile.phone?.trim()) cleanData.phone = profile.phone.trim();
      if (profile.hometown?.trim()) cleanData.hometown = profile.hometown.trim();
      if (profile.major?.trim()) cleanData.major = profile.major.trim();
      if (profile.academicYear?.trim()) cleanData.academicYear = profile.academicYear.trim();
      if (profile.purpose?.trim()) cleanData.purpose = profile.purpose.trim();
      if (profile.description?.trim()) cleanData.description = profile.description.trim();
      // KHÔNG include photoURL vào cleanData khi save form — ảnh được lưu riêng qua handlePhotoUpload
      // Chỉ include photoURL nếu là URL thông thường (không phải base64), để tránh ghi ~100KB mỗi lần save
      if (profile.photoURL && !profile.photoURL.startsWith('data:')) {
        cleanData.photoURL = profile.photoURL;
      }
      if (profile.birthDate) cleanData.birthDate = profile.birthDate;
      if (profile.zodiac) cleanData.zodiac = profile.zodiac;

      // Add optional typed fields
      if (profile.gender) cleanData.gender = profile.gender;
      if (profile.interests && profile.interests.length > 0) cleanData.interests = profile.interests;
      if (profile.studyGoals && profile.studyGoals.length > 0) cleanData.studyGoals = profile.studyGoals;
      if (typeof profile.age === 'number' && profile.age > 0) cleanData.age = profile.age;

      // Add boolean fields
      cleanData.showPhone = profile.showPhone !== false;
      cleanData.showHometown = profile.showHometown !== false;
      cleanData.showLocation = profile.showLocation !== false;

      // Add location if exists
      if (profile.location) {
        cleanData.location = profile.location;
      }

      const finalProfile = { ...profile, ...cleanData } as StudentProfile;

      // Optimistic update: cập nhật UI & cache ngay lập tức, không đợi Firestore
      // Cập nhật cache ngay — strip base64 photoURL
      try {
        const profileToCache = { ...finalProfile };
        if (profileToCache.photoURL?.startsWith('data:')) {
          delete profileToCache.photoURL;
        }
        setCachedData(
          { key: `profile_${user.uid}`, ttl: 10 * 60 * 1000, storage: 'localStorage' },
          profileToCache
        );
      } catch (_) {}
      // Tắt spinner và gọi onSave TRƯỚC khi await Firestore
      setSaving(false);
      onSave(finalProfile);
      toast.success('Đã lưu hồ sơ thành công! ✓');

      // Ghi Firestore ngầm (fire-and-forget) — không block UI
      setDoc(doc(db, 'profiles', user.uid), cleanData, { merge: true }).catch((error: any) => {
        console.error('Profile save error (background):', error);
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('permission-denied') || errorMsg.includes('PERMISSION_DENIED')) {
          toast.error('Không có quyền lưu hồ sơ. Vui lòng đăng nhập lại.');
        } else if (errorMsg.includes('offline') || errorMsg.includes('unavailable')) {
          toast.error('Không có kết nối mạng. Dữ liệu sẽ được đồng bộ khi có mạng.');
        } else {
          toast.error('Có lỗi khi đồng bộ dữ liệu. Vui lòng thử lại.');
        }
      });    } catch (error: any) {
      console.error('Profile save error:', error);
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('permission-denied') || errorMsg.includes('PERMISSION_DENIED')) {
        toast.error('Không có quyền lưu hồ sơ. Vui lòng đăng nhập lại và thử lại.');
      } else if (errorMsg.includes('offline') || errorMsg.includes('unavailable')) {
        toast.error('Không có kết nối mạng. Vui lòng kiểm tra internet và thử lại.');
      } else {
        toast.error('Có lỗi xảy ra khi lưu hồ sơ. Vui lòng thử lại.');
      }
    } finally {
      setSaving(false);
    }
  };

  const STUDY_GOALS = [
    'Học nhóm',
    'Trao đổi tài liệu',
    'Chia sẻ mẹo/kinh nghiệm',
    'Học trực tuyến / ngoại tuyến'
  ];

  const handleStudyGoalChange = (goal: string) => {
    setProfile(prev => {
      const currentGoals = prev.studyGoals || [];
      if (currentGoals.includes(goal)) {
        return { ...prev, studyGoals: currentGoals.filter(g => g !== goal) };
      } else {
        return { ...prev, studyGoals: [...currentGoals, goal] };
      }
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      // Compress image with HIGH QUALITY for avatar and auto center-crop to 1:1 SQUARE
      const compressed = await compressImage(file, 600, 600, 0.95, true);
      
      // Check size (max 100KB after compression)
      if (compressed.size > 100 * 1024) {
        toast.error('Ảnh vẫn còn quá lớn sau khi nén. Vui lòng chọn ảnh khác.');
        return;
      }

      // Update profile with compressed image
      setProfile(prev => ({ ...prev, photoURL: compressed.dataUrl }));
      
      // Auto-save to Firestore
      await setDoc(doc(db, 'profiles', user.uid), {
        photoURL: compressed.dataUrl,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      toast.success(`Đã lưu ảnh đại diện! Kích thước: ${formatFileSize(compressed.size)}`);
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast.error(error.message || 'Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setUploadingPhoto(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-xl border border-gray-100">
      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mb-8 md:mb-10 p-4 md:p-6 bg-gradient-to-br from-indigo-50/50 via-violet-50/50 to-blue-50/50 rounded-3xl border border-indigo-100/50">
        <div className="relative group">
          {/* Clickable Avatar Container */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-lg border-[5px] border-indigo-500 transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ring-2 ring-indigo-200"
          >
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt="Avatar"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <UserIcon className="w-10 h-10 text-gray-400" />
              </div>
            )}
            
            {/* Upload Overlay - Always visible on mobile, hover on desktop */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-2">
              <div className="flex flex-col items-center gap-1">
                <Camera className="w-5 h-5 text-white drop-shadow-lg" />
                <span className="text-[10px] text-white font-bold drop-shadow-lg">Đổi ảnh</span>
              </div>
            </div>

            {/* Loading Overlay */}
            {uploadingPhoto && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <span className="text-[10px] text-white font-bold">Đang tải...</span>
              </div>
            )}

            {/* Pulse Ring Effect when uploading */}
            {uploadingPhoto && (
              <div className="absolute inset-0 rounded-2xl border-2 border-indigo-500 animate-ping opacity-75"></div>
            )}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {/* Camera Icon Badge - Desktop only */}
          <div className="hidden md:block absolute -bottom-2 -right-2 p-2 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-xl shadow-lg pointer-events-none">
            <Camera className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 text-center md:text-left space-y-1">
          <h2 className="text-2xl md:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 tracking-tight">Cập nhật hồ sơ</h2>
          <p 
            className="text-sm font-medium leading-relaxed"
            style={{ color: theme === 'dark' ? '#d1d5db' : '#4b5563' }}
          >
            Hoàn thiện thông tin để bắt đầu kết nối với sinh viên TVU.
          </p>
          <p className="text-xs text-indigo-600 font-semibold mt-2 flex items-center justify-center md:justify-start gap-1">
            <Camera className="w-3 h-3" />
            Chạm vào ảnh để thay đổi
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
        {/* MSSV */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <Info className="w-4 h-4" /> Mã số sinh viên <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="mssv"
            value={profile.mssv}
            onChange={handleChange}
            pattern="[0-9]{9}"
            maxLength={9}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Ví dụ: 110121001 (9 số)"
            title="MSSV phải có đúng 9 chữ số"
          />
        </div>

        {/* Họ tên */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <UserIcon className="w-4 h-4" /> Họ và tên <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="fullName"
            value={profile.fullName}
            onChange={handleChange}
            onBlur={handleNameBlur}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Nguyễn Văn A"
          />
        </div>

        {/* Biệt danh */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <UserIcon className="w-4 h-4" /> Biệt danh
          </label>
          <input
            name="nickname"
            value={profile.nickname || ''}
            onChange={handleChange}
            maxLength={50}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Tên thân mật (tùy chọn)"
          />
        </div>

        {/* Lớp */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <GraduationCap className="w-4 h-4" /> Lớp <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="className"
            value={profile.className}
            onChange={handleChange}
            maxLength={20}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Ví dụ: DA21CNTT"
          />
        </div>

        {/* Số điện thoại */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <Phone className="w-4 h-4" /> Số điện thoại <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="phone"
            value={profile.phone}
            onChange={handleChange}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="0123456789"
            pattern="[0-9]{10,11}"
            title="Vui lòng nhập số điện thoại hợp lệ (10-11 số)"
          />
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="showPhone"
              checked={profile.showPhone}
              onChange={(e) => setProfile(prev => ({ ...prev, showPhone: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Hiển thị số điện thoại cho người khác</span>
          </label>
        </div>

        {/* Quê quán */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <MapPin className="w-4 h-4" /> Quê quán <span className="text-red-500">*</span>
          </label>
          <select
            required
            name="hometown"
            value={profile.hometown}
            onChange={handleChange}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          >
            <option value="">-- Chọn tỉnh/thành phố --</option>
            {VIETNAM_PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="showHometown"
              checked={profile.showHometown}
              onChange={(e) => setProfile(prev => ({ ...prev, showHometown: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Hiển thị quê quán cho người khác</span>
          </label>
        </div>

        {/* Ngành học */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <BookOpen className="w-4 h-4" /> Ngành học <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="major"
            value={profile.major}
            onChange={handleChange}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Ví dụ: Công Nghệ Thông Tin"
          />
        </div>

        {/* Niên Khóa */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <Calendar className="w-4 h-4" /> Niên khóa <span className="text-red-500">*</span>
          </label>
          <input
            required
            name="academicYear"
            value={profile.academicYear}
            onChange={handleChange}
            pattern="20[0-9]{2}\s*-\s*20[0-9]{2}"
            maxLength={13}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="Ví dụ: 2023 - 2027"
            title="Niên khóa phải có định dạng: năm - năm (VD: 2023 - 2027)"
          />
        </div>

        {/* Giới tính */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">Giới tính <span className="text-red-500">*</span></label>
          <select
            required
            name="gender"
            value={profile.gender}
            onChange={handleChange}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          >
            <option value="">-- Chọn giới tính --</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </select>
        </div>

        {/* Ngày sinh */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <Calendar className="w-4 h-4" /> Ngày sinh
          </label>
          <input
            type="date"
            name="birthDate"
            value={profile.birthDate}
            onChange={handleChange}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Cung hoàng đạo (Auto) */}
        <div className="space-y-1.5">
          <label className="text-sm md:text-base font-bold text-gray-700 flex items-center gap-2 ml-0.5">
            <Sparkles className="w-4 h-4" /> Cung hoàng đạo
          </label>
          <input
            readOnly
            value={profile.zodiac || 'Tự động cập nhật'}
            className="w-full px-4 py-3.5 bg-gray-100 border border-gray-200 rounded-xl text-base text-gray-500 outline-none cursor-not-allowed"
          />
        </div>
      </div>

      {/* Sở thích */}
      <div className="mt-8 space-y-1.5">
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 ml-0.5">
          <Heart className="w-4 h-4" /> Sở thích
        </label>
        <input
          value={interestInput}
          onChange={(e) => setInterestInput(e.target.value)}
          onKeyDown={handleAddInterest}
          className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder="Ví dụ: Đá bóng, Đọc sách, Code..."
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {profile.interests?.map((interest) => (
            <span
              key={interest}
              className="px-3 py-1 bg-blue-50 text-blue-600 text-sm font-medium rounded-full flex items-center gap-1 group"
            >
              {interest}
              <button
                type="button"
                onClick={() => removeInterest(interest)}
                className="hover:text-blue-800 focus:outline-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Mục đích */}
      <div className="mt-8 space-y-1.5">
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 ml-0.5">
          <FileText className="w-4 h-4" /> Mục đích kết nối
        </label>
        <input
          name="purpose"
          value={profile.purpose}
          onChange={handleChange}
          className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder="Ví dụ: Tìm bạn cùng học, Tìm người yêu..."
        />
      </div>

      {/* Mục tiêu học tập */}
      <div className="mt-8 space-y-2">
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 ml-0.5">
          <BookOpen className="w-4 h-4" /> Mục tiêu học tập
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STUDY_GOALS.map((goal) => (
            <label key={goal} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors group">
              <input
                type="checkbox"
                checked={profile.studyGoals?.includes(goal)}
                onChange={() => handleStudyGoalChange(goal)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
              />
              <span className="text-sm text-gray-700 font-medium group-hover:text-blue-700">{goal}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Mô tả */}
      <div className="mt-8 space-y-1.5">
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 ml-0.5">
          <FileText className="w-4 h-4" /> Giới thiệu bản thân
        </label>
        <textarea
          name="description"
          value={profile.description}
          onChange={handleChange}
          rows={4}
          className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
          placeholder="Hãy viết vài dòng về bản thân bạn..."
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-4 text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 hover:opacity-90 disabled:from-indigo-400 disabled:to-blue-400 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.97]"
      >
        {saving ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Lưu hồ sơ
          </>
        )}
      </button>

      {/* Danh sách chặn */}
      <div className="mt-12 pt-12 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-50 rounded-xl">
            <ShieldOff className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900">Danh sách chặn</h3>
            <p className="text-sm text-gray-500 font-medium">Quản lý những người bạn đã chặn</p>
          </div>
        </div>

        {loadingBlocks ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-8 text-center border border-dashed border-gray-200">
            <p className="text-gray-400 text-sm font-medium">Bạn chưa chặn người dùng nào.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((blockedUser) => (
              <div
                key={blockedUser.uid}
                className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3">
                  {blockedUser.photoURL ? (
                    <img
                      src={blockedUser.photoURL}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-gray-900">{blockedUser.fullName}</p>
                    <p className="text-xs text-gray-500">{blockedUser.major || 'Sinh viên TVU'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserToUnblock(blockedUser);
                    setIsConfirmUnblockOpen(true);
                  }}
                  disabled={unblockingId === blockedUser.uid}
                  className="px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  {unblockingId === blockedUser.uid ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Bỏ chặn'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={isConfirmUnblockOpen}
        onClose={() => {
          setIsConfirmUnblockOpen(false);
          setUserToUnblock(null);
        }}
        onConfirm={handleUnblock}
        title="Bỏ chặn người dùng"
        message={`Bạn có muốn bỏ chặn ${userToUnblock?.fullName}? Sau khi bỏ chặn, hai bạn có thể tìm thấy nhau và trò chuyện trở lại.`}
        confirmText="Bỏ chặn"
      />
    </form>
  );
};
