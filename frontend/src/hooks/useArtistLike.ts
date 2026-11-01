import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import notify from "@/lib/notify";

export function useArtistLike(
  artistId?: string,
  artistData?: { name?: string; title?: string; imageUrl?: string; image?: string; coverUrl?: string }
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: likedArtists = [] } = useQuery<any[]>({
    queryKey: ["liked-artists"],
    queryFn: async () => {
      try {
        const res = await api.get("artists/liked");
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated !== false,
  });

  const cleanName = (artistData?.name || artistData?.title || "").trim().toLowerCase();
  const isLiked =
    !!artistId &&
    likedArtists.some((a: any) => {
      if (a.id === artistId) return true;
      const an = (a.name || "").trim().toLowerCase();
      return !!cleanName && an === cleanName;
    });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!artistId) return;
      const res = await api.post(`artists/${artistId}/like`, artistData);
      return res.data;
    },
    onMutate: async () => {
      if (!artistId) return;
      await queryClient.cancelQueries({ queryKey: ["liked-artists"] });
      const previous = queryClient.getQueryData<any[]>(["liked-artists"]) || [];
      const exists = previous.some(
        (a) => a.id === artistId || (!!cleanName && (a.name || "").trim().toLowerCase() === cleanName)
      );
      const next = exists
        ? previous.filter(
            (a) => a.id !== artistId && (!cleanName || (a.name || "").trim().toLowerCase() !== cleanName)
          )
        : [
            {
              id: artistId,
              name: artistData?.name || artistData?.title || "Artist",
              image: artistData?.imageUrl || artistData?.image || artistData?.coverUrl || "",
            },
            ...previous,
          ];

      queryClient.setQueryData(["liked-artists"], next);
      if (exists) {
        notify("Removed artist from Favorites", "info");
      } else {
        notify("Added artist to Favorites", "success");
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["liked-artists"], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-artists"] });
      queryClient.invalidateQueries({ queryKey: ["my-artists"] });
      queryClient.invalidateQueries({ queryKey: ["library-overview"] });
    },
  });

  return {
    isLiked,
    toggleLike: (e?: React.MouseEvent | any) => {
      e?.stopPropagation?.();
      mutation.mutate();
    },
    isLoading: mutation.isPending,
  };
}
