/**
 * Example usage of FirestoreCacheManager
 * 
 * This file demonstrates how to integrate the cache manager
 * with Firestore queries in TVU Connect.
 */

import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { FirestoreCacheManager } from './firestoreCacheManager';
import { logger } from '@/utils/logger';

// ============================================================================
// Example 1: Posts Feed Caching
// ============================================================================

const postsCache = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: 60000, // 60 seconds
});

interface Post {
  id: string;
  content: string;
  authorId: string;
  createdAt: number;
}

export async function loadPostsFeed(page: number = 1): Promise<Post[]> {
  const cacheKey = `posts:feed:page${page}`;
  
  // Check cache first
  const cached = postsCache.get<Post[]>(cacheKey);
  if (cached) {
    logger.log('✓ Posts loaded from cache');
    return cached;
  }
  
  logger.log('✗ Cache miss, fetching from Firestore');
  
  // Cache miss, fetch from Firestore
  const eighteenHoursAgo = Date.now() - (18 * 60 * 60 * 1000);
  const postsQuery = query(
    collection(db, 'posts'),
    where('createdAt', '>', eighteenHoursAgo),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  
  const snapshot = await getDocs(postsQuery);
  const posts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Post));
  
  // Store in cache
  postsCache.set(cacheKey, posts);
  
  return posts;
}

export function invalidatePostsCache() {
  // Invalidate all posts cache when new post is created
  postsCache.invalidatePattern('posts:*');
  logger.log('✓ Posts cache invalidated');
}

// ============================================================================
// Example 2: User Profile Caching
// ============================================================================

const profileCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 180000, // 3 minutes
});

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  bio: string;
  major: string;
  academicYear: number;
}

export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const cacheKey = `profile:${userId}`;
  
  // Check cache first
  const cached = profileCache.get<UserProfile>(cacheKey);
  if (cached) {
    logger.log(`✓ Profile for ${userId} loaded from cache`);
    return cached;
  }
  
  logger.log(`✗ Cache miss, fetching profile for ${userId}`);
  
  // Cache miss, fetch from Firestore
  const profileQuery = query(
    collection(db, 'profiles'),
    where('uid', '==', userId),
    limit(1)
  );
  
  const snapshot = await getDocs(profileQuery);
  if (snapshot.empty) {
    return null;
  }
  
  const profile = {
    uid: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  } as UserProfile;
  
  // Store in cache
  profileCache.set(cacheKey, profile);
  
  return profile;
}

export function invalidateUserProfile(userId: string) {
  profileCache.invalidate(`profile:${userId}`);
  logger.log(`✓ Profile cache for ${userId} invalidated`);
}

// ============================================================================
// Example 3: Online Status Caching
// ============================================================================

const statusCache = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: 30000, // 30 seconds
});

interface OnlineStatus {
  online: boolean;
  lastSeen: number;
}

export async function getOnlineStatus(userId: string): Promise<OnlineStatus> {
  const cacheKey = `status:${userId}`;
  
  // Check cache first
  const cached = statusCache.get<OnlineStatus>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Cache miss, fetch from Firestore
  const statusQuery = query(
    collection(db, 'onlineStatus'),
    where('uid', '==', userId),
    limit(1)
  );
  
  const snapshot = await getDocs(statusQuery);
  const status: OnlineStatus = snapshot.empty
    ? { online: false, lastSeen: Date.now() }
    : snapshot.docs[0].data() as OnlineStatus;
  
  // Store in cache
  statusCache.set(cacheKey, status);
  
  return status;
}

// ============================================================================
// Example 4: Matching Profiles Caching
// ============================================================================

const matchingCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 86400000, // 24 hours for viewed profiles
});

interface MatchingProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  major: string;
  academicYear: number;
  gender: string;
}

export async function loadMatchingProfiles(
  gender: string,
  major: string,
  academicYear: number
): Promise<MatchingProfile[]> {
  const cacheKey = `matching:${gender}:${major}:${academicYear}`;
  
  // Check cache first
  const cached = matchingCache.get<MatchingProfile[]>(cacheKey);
  if (cached) {
    logger.log('✓ Matching profiles loaded from cache');
    return cached;
  }
  
  logger.log('✗ Cache miss, fetching matching profiles');
  
  // Cache miss, fetch from Firestore
  const matchingQuery = query(
    collection(db, 'profiles'),
    where('gender', '==', gender),
    where('majorNormalized', '==', major),
    where('academicYear', '==', academicYear),
    limit(50)
  );
  
  const snapshot = await getDocs(matchingQuery);
  const profiles = snapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data()
  } as MatchingProfile));
  
  // Store in cache with 24h TTL
  matchingCache.set(cacheKey, profiles, 86400000);
  
  return profiles;
}

export function markProfileAsViewed(userId: string) {
  const cacheKey = `viewed:${userId}`;
  matchingCache.set(cacheKey, true, 86400000); // 24 hours
}

export function isProfileViewed(userId: string): boolean {
  return matchingCache.has(`viewed:${userId}`);
}

// ============================================================================
// Example 5: Places Caching
// ============================================================================

const placesCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 300000, // 5 minutes
});

interface Place {
  id: string;
  name: string;
  category: string;
  coordinates: { lat: number; lng: number };
}

export async function loadPlaces(category?: string): Promise<Place[]> {
  const cacheKey = category ? `places:${category}` : 'places:all';
  
  // Check cache first
  const cached = placesCache.get<Place[]>(cacheKey);
  if (cached) {
    logger.log('✓ Places loaded from cache');
    return cached;
  }
  
  logger.log('✗ Cache miss, fetching places');
  
  // Cache miss, fetch from Firestore
  const isMobile = window.innerWidth < 768;
  const maxPlaces = isMobile ? 100 : 200;
  
  let placesQuery = query(
    collection(db, 'places'),
    limit(maxPlaces)
  );
  
  if (category) {
    placesQuery = query(
      collection(db, 'places'),
      where('category', '==', category),
      limit(maxPlaces)
    );
  }
  
  const snapshot = await getDocs(placesQuery);
  const places = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Place));
  
  // Store in cache
  placesCache.set(cacheKey, places);
  
  return places;
}

// ============================================================================
// Cache Statistics Monitoring
// ============================================================================

export function logCacheStatistics() {
  logger.log('=== Cache Statistics ===');
  
  logger.log('\nPosts Cache:');
  logger.log(postsCache.getStats());
  
  logger.log('\nProfile Cache:');
  logger.log(profileCache.getStats());
  
  logger.log('\nStatus Cache:');
  logger.log(statusCache.getStats());
  
  logger.log('\nMatching Cache:');
  logger.log(matchingCache.getStats());
  
  logger.log('\nPlaces Cache:');
  logger.log(placesCache.getStats());
}

// Log cache stats every minute in development
if (import.meta.env.DEV) {
  setInterval(logCacheStatistics, 60000);
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

export function invalidateAllCaches() {
  postsCache.clear();
  profileCache.clear();
  statusCache.clear();
  matchingCache.clear();
  placesCache.clear();
  logger.log('✓ All caches cleared');
}

export function invalidateUserRelatedCaches(userId: string) {
  profileCache.invalidate(`profile:${userId}`);
  statusCache.invalidate(`status:${userId}`);
  matchingCache.invalidatePattern(`viewed:${userId}`);
  logger.log(`✓ All caches for user ${userId} invalidated`);
}
