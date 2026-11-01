import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import notify from '@/lib/notify';

export function useLikeTrack(trackId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!trackId) return;
      await api.post(`tracks/${trackId}/like`);
    },
    onMutate: async () => {
      if (!trackId) return { previousLikedIds: undefined };
      await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
      const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
      const isCurrentlyLiked = previousLikedIds?.includes(trackId);
      const newLikedIds = previousLikedIds ? (
        isCurrentlyLiked
          ? previousLikedIds.filter(id => id !== trackId)
          : [...previousLikedIds, trackId]
      ) : [trackId];
      queryClient.setQueryData(['liked-track-ids'], newLikedIds);
      if (isCurrentlyLiked) {
        notify("Removed from Liked Songs", "info");
      } else {
        notify("Added to Liked Songs", "success");
      }
      return { previousLikedIds };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousLikedIds !== undefined) {
        queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
      queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
    }
  });
}
