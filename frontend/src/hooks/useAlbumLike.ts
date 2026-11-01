import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export function useAlbumLike(
  albumId?: string,
  albumData?: {
    title?: string;
    name?: string;
    coverUrl?: string;
    cover?: string;
    artist?: any;
    artistName?: string;
    year?: string;
    releaseDate?: string;
    trackCount?: number;
  }
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: likedAlbums = [] } = useQuery<any[]>({
    queryKey: ["liked-albums"],
    queryFn: async () => {
      try {
        const res = await api.get("albums/liked");
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated !== false,
  });

  const cleanTitle = (albumData?.title || albumData?.name || "").trim().toLowerCase();
  const isLiked =
    !!albumId &&
    likedAlbums.some((a: any) => {
      if (a.id === albumId) return true;
      const at = (a.title || a.name || "").trim().toLowerCase();
      return !!cleanTitle && at === cleanTitle;
    });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!albumId) return;
      const res = await api.post(`albums/${albumId}/like`, albumData);
      return res.data;
    },
    onMutate: async () => {
      if (!albumId) return;
      await queryClient.cancelQueries({ queryKey: ["liked-albums"] });
      const previous = queryClient.getQueryData<any[]>(["liked-albums"]) || [];
      const exists = previous.some(
        (a) => a.id === albumId || (!!cleanTitle && (a.title || a.name || "").trim().toLowerCase() === cleanTitle)
      );
      const next = exists
        ? previous.filter(
            (a) => a.id !== albumId && (!cleanTitle || (a.title || a.name || "").trim().toLowerCase() !== cleanTitle)
          )
        : [
            {
              id: albumId,
              title: albumData?.title || albumData?.name || "Album",
              name: albumData?.title || albumData?.name || "Album",
              coverUrl: albumData?.coverUrl || albumData?.cover || "",
              artist: albumData?.artist || { name: albumData?.artistName || "Unknown Artist" },
              year: albumData?.year || albumData?.releaseDate || "",
              trackCount: albumData?.trackCount || 0,
              isAlbum: true,
              type: "album",
            },
            ...previous,
          ];

      queryClient.setQueryData(["liked-albums"], next);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["liked-albums"], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-albums"] });
      queryClient.invalidateQueries({ queryKey: ["my-albums"] });
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
