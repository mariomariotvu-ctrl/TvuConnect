import { Timestamp } from './firebase';

export interface StudentProfile {
  mssv: string;
  fullName: string;
  nickname?: string;
  className?: string;
  phone?: string;
  showPhone?: boolean;
  hometown?: string;
  showHometown?: boolean;
  major?: string;
  majorNormalized?: string;
  /** Prefix tokens for name/class/major discovery; never includes private data. */
  searchTokens?: string[];
  interests?: string[];
  gender?: 'male' | 'female' | 'other';
  birthDate?: string;
  age?: number;
  zodiac?: string;
  academicYear?: string;
  purpose?: string;
  studyGoals?: string[];
  description?: string;
  uid: string;
  photoURL?: string;
  email: string;
  isOnline?: boolean;
  lastSeen?: any;
  /** @deprecated Legacy public profile coordinate. New writes purge this field. */
  location?: {
    lat: number;
    lng: number;
    address?: string;
    updatedAt?: Timestamp;
  };
  /** @deprecated Live-location visibility is stored in private locationPreferences. */
  showLocation?: boolean;
  /**
   * Nearby discovery is opt-in. These fields deliberately store an
   * approximate cell centre, never the browser's exact coordinates.
   */
  nearbyOptIn?: boolean;
  nearbyCell?: string;
  nearbyLatitude?: number;
  nearbyLongitude?: number;
  nearbyUpdatedAt?: Timestamp;
  /** Dating is opt-in and restricted to adult profiles. */
  datingEnabled?: boolean;
  /** Hide the profile photo inside the dating deck until the owner disables it. */
  hideFaceInDating?: boolean;
  datingBio?: string;
  university?: string;
  campus?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type View = 'home' | 'profile' | 'matching' | 'students' | 'results' | 'chat' | 'conversations' | 'settings' | 'posts' | 'explore' | 'documents';

export interface Message {
  id?: string;
  senderUid: string;
  receiverUid: string;
  conversationId: string;
  participants: string[];
  text?: string;
  audioUrl?: string;
  type: 'text' | 'audio';
  createdAt: any;
  read?: boolean;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount?: { [uid: string]: number };
}

export interface Report {
  reporterUid: string;
  reportedUid: string;
  reason: string;
  details?: string;
  createdAt: Timestamp;
}

export interface Block {
  blockerUid: string;
  blockedUid: string;
  createdAt: Timestamp;
}

export type FriendConnectionState = 'none' | 'incoming' | 'pending' | 'accepted';

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  participantUids: string[];
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Friendship {
  id: string;
  participantUids: string[];
  status: 'accepted';
  acceptedAt?: Timestamp;
}

export type LocationVisibility = 'off' | 'friends' | 'major' | 'tvu';

export interface LocationPreferences {
  uid: string;
  visibility: LocationVisibility;
  encounterAlertsEnabled: boolean;
  updatedAt?: Timestamp;
}

export interface VisibleStudentLocation {
  uid: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  visibility: Exclude<LocationVisibility, 'off'>;
  updatedAt: number;
  expiresAt: number;
  fullName: string;
  photoURL?: string | null;
  major?: string;
  isFriend: boolean;
  isOwn: boolean;
}

export interface StudentEncounter {
  id: string;
  participantUids: string[];
  occurredAt?: Timestamp;
  distanceBand: 'very-close' | 'nearby';
}

export interface Favorite {
  fromUid: string;
  toUid: string;
  createdAt: Timestamp;
}

export interface Match {
  id?: string;
  userUid: string;
  matchedUid: string;
  matchedProfile?: StudentProfile | null; // Optional: Firestore docs may lack this field (legacy data / race condition)
  createdAt: Timestamp;
}

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export interface Reaction {
  userId: string;
  userName: string;
  userAvatar?: string;
  type: ReactionType;
  createdAt: Date | Timestamp;
}

export interface Post {
  id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  images?: string[]; // Mảng ảnh (base64 hoặc URLs)
  createdAt: Timestamp;
  likes: string[]; // Deprecated - keep for backward compatibility
  likeCount: number; // Deprecated - keep for backward compatibility
  reactions?: Reaction[]; // New reactions system
  reactionCounts?: {
    like: number;
    love: number;
    haha: number;
    wow: number;
  };
  commentCount?: number; // Number of comments
}

export interface Comment {
  id?: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: Timestamp;
  likes: string[]; // Deprecated - keep for backward compatibility
  likeCount: number; // Deprecated - keep for backward compatibility
  reactions?: Reaction[]; // New reactions system
  reactionCounts?: {
    like: number;
    love: number;
    haha: number;
    wow: number;
    sad: number;
    angry: number;
  };
  parentCommentId?: string; // For replies
  replyCount?: number; // Number of replies
  isEdited?: boolean;
  editedAt?: Timestamp;
}

export interface Notification {
  id?: string;
  userId: string; // Recipient
  type: 'comment' | 'reply' | 'like' | 'reaction';
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  postId?: string;
  commentId?: string;
  content?: string; // Preview of comment/reply
  isRead: boolean;
  createdAt: Timestamp;
}

// ===============================================================
// MAP & EXPLORE FEATURE TYPES
// ===============================================================

export type PlaceCategory = 
  | 'cafe'        // Quán cafe
  | 'restaurant'  // Quán ăn
  | 'vegetarian'  // Quán chay
  | 'pharmacy'    // Nhà thuốc
  | 'flower'      // Tiệm hoa
  | 'printing'    // In ấn / Photocopy
  | 'clothing'    // Quần áo / May thuê
  | 'shop'        // Cửa hàng
  | 'library'     // Thư viện
  | 'park'        // Công viên
  | 'study'       // Chỗ học
  | 'sport'       // Thể thao
  | 'bookstore'   // Nhà sách / Mua tài liệu
  | 'entertainment'  // Khu vui chơi (Game, Karaoke, Billiards) - Added 10/4/2026
  | 'other';      // Khác

export interface Place {
  id?: string;
  name: string;
  category: PlaceCategory;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  description?: string;
  images?: string[];
  amenities?: string[]; // ["wifi", "parking", "ac", "quiet"]
  priceRange?: '$' | '$$' | '$$$';
  openHours?: string;
  phone?: string;
  website?: string;
  rating: number;
  reviewCount: number;
  checkInCount: number; // Total check-ins
  currentVisitors: number; // Current people here
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  isVerified?: boolean;
  /** Source metadata is transient for provider content and is never persisted by the client. */
  dataSource?: 'community' | 'google_places';
  sourceLabel?: 'Google Maps' | 'TVU Connect';
  sourcePlaceId?: string;
  primaryType?: string;
  foodTags?: string[];
  businessStatus?: string;
  openingDate?: string | null;
  isOpenNow?: boolean;
  popularityScore?: number;
}

export interface CheckIn {
  id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  placeId: string;
  placeName: string;
  status?: 'studying' | 'working' | 'hanging_out' | 'waiting' | 'available';
  statusText?: string; // Custom status
  visibility: 'public' | 'friends' | 'private';
  createdAt: Timestamp;
  expiresAt: Timestamp; // Auto expire after 4 hours
}

export interface PlaceEvent {
  id?: string;
  placeId: string;
  placeName: string;
  placeLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  title: string;
  description: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  startTime: Timestamp;
  endTime: Timestamp;
  maxParticipants?: number;
  participants: string[]; // User IDs
  participantProfiles?: StudentProfile[]; // Populated profiles
  category?: string; // "study", "sports", "social", etc.
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlaceReview {
  id?: string;
  placeId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number; // 1-5
  content: string;
  images?: string[];
  likes: string[];
  likeCount: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type CommunityReviewTarget = 'place' | 'rental' | 'google_place';

export interface CommunityReview {
  id?: string;
  targetKind: CommunityReviewTarget;
  targetId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ===============================================================
// RENTAL (TÌM TRỌ) FEATURE TYPES
// ===============================================================

export type RentalType = 'nha-tro' | 'o-ghep' | 'nha-nghi' | 'khach-san' | 'khac';

export interface RentalPost {
  id?: string;
  title: string;
  type: RentalType;
  price: number;           // VND/tháng
  area?: number;           // m²
  address: string;
  location?: {
    lat: number;
    lng: number;
  };
  /** Indexed location key used by Firestore radius queries. */
  geohash?: string;
  district?: string;
  description: string;
  amenities: string[];     // ['wifi', 'dieu-hoa', 'nha-ve-sinh-rieng', 'giu-xe', 'may-giat']
  contactName: string;
  contactPhone: string;
  images?: string[];
  isAvailable: boolean;
  /** Optional costs make a listing comparable before students need to call. */
  deposit?: number;
  electricityPrice?: number;
  waterPrice?: number;
  genderPreference?: 'any' | 'male' | 'female';
  availableFrom?: string;
  utilitiesNote?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
