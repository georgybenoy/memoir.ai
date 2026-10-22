import { create } from 'zustand';
import { getDueReviewQueue } from '@/features/spaced-repetition/queue';

export interface ReviewState {
  totalDueCount: number;
  weakCount: number;
  overdueCount: number;
  bannerDismissed: boolean;
  refreshDueCounts: (dbName?: string) => Promise<void>;
  dismissBanner: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  totalDueCount: 0,
  weakCount: 0,
  overdueCount: 0,
  bannerDismissed: false,

  refreshDueCounts: async (dbName) => {
    try {
      const queue = await getDueReviewQueue({ dbName });
      set({
        totalDueCount: queue.totalDueCount,
        weakCount: queue.weak.length,
        overdueCount: queue.overdue.length,
      });
    } catch (err) {
      console.warn('Failed to refresh due review counts:', err);
    }
  },

  dismissBanner: () => set({ bannerDismissed: true }),
}));
