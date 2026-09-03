/**
 * Trending Score Algorithm for TVU Connect Posts
 * 
 * Based on Reddit's Hot Algorithm with modifications for student social network
 * 
 * Formula:
 * score = log10(max(engagement, 1)) + (age_in_hours / time_decay_factor)
 * 
 * Where:
 * - engagement = total reactions + (comments * comment_weight)
 * - age_in_hours = hours since post creation
 * - time_decay_factor = controls how fast old posts decay (lower = faster decay)
 */

import { Post } from '../types';

interface TrendingScoreConfig {
  commentWeight: number;      // Weight for comments vs reactions (default: 2)
  timeDecayFactor: number;     // Hours for score to decay (default: 2 = decay every 2 hours)
  minEngagement: number;       // Minimum engagement to avoid log(0) (default: 1)
}

const DEFAULT_CONFIG: TrendingScoreConfig = {
  commentWeight: 2,           // Comments are 2x more valuable than reactions
  timeDecayFactor: 2,         // Score decays every 2 hours
  minEngagement: 1,           // Prevent log(0)
};

/**
 * Calculate trending score for a post
 * 
 * @param post - The post to calculate score for
 * @param config - Optional configuration for scoring algorithm
 * @returns Trending score (higher = more trending)
 */
export function calculateTrendingScore(
  post: Post,
  config: Partial<TrendingScoreConfig> = {}
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate engagement
  const reactionCount = Array.isArray(post.reactions) ? post.reactions.length : 0;
  const commentCount = post.commentCount || 0;
  const engagement = reactionCount + (commentCount * cfg.commentWeight);

  // Calculate age in hours
  const now = Date.now();
  let postDate: Date;
  
  if (!post.createdAt) {
    postDate = new Date(); // Fallback to now if no createdAt
  } else if (typeof post.createdAt === 'object' && 'toDate' in post.createdAt) {
    // Firebase Timestamp
    postDate = post.createdAt.toDate();
  } else {
    // Regular Date or timestamp number
    postDate = new Date(post.createdAt as any);
  }
  
  const ageInHours = (now - postDate.getTime()) / (1000 * 60 * 60);

  // Calculate score
  // log10 gives diminishing returns for high engagement
  // Negative age penalty makes older posts decay
  const engagementScore = Math.log10(Math.max(engagement, cfg.minEngagement));
  const ageScore = -(ageInHours / cfg.timeDecayFactor);
  
  const score = engagementScore + ageScore;

  return score;
}

/**
 * Sort posts by trending score (highest first)
 * 
 * @param posts - Array of posts to sort
 * @param config - Optional configuration for scoring algorithm
 * @returns Sorted array of posts (does not mutate original)
 */
export function sortPostsByTrending(
  posts: Post[],
  config: Partial<TrendingScoreConfig> = {}
): Post[] {
  return [...posts].sort((a, b) => {
    const scoreA = calculateTrendingScore(a, config);
    const scoreB = calculateTrendingScore(b, config);
    return scoreB - scoreA; // Descending order
  });
}

/**
 * Get top trending posts
 * 
 * @param posts - Array of posts
 * @param limit - Maximum number of posts to return
 * @param config - Optional configuration for scoring algorithm
 * @returns Top trending posts
 */
export function getTopTrendingPosts(
  posts: Post[],
  limit: number = 10,
  config: Partial<TrendingScoreConfig> = {}
): Post[] {
  const sorted = sortPostsByTrending(posts, config);
  return sorted.slice(0, limit);
}
