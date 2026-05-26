import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlaylistWithCount, PlaylistItem, DJRecommendation } from "@shared/schema";

export function usePlaylists() {
  return useQuery<PlaylistWithCount[]>({
    queryKey: ["/api/playlists"],
  });
}

export function useCuratedPlaylists() {
  return useQuery<PlaylistWithCount[]>({
    queryKey: ["/api/playlists/curated"],
  });
}

export function usePlaylist(id: string) {
  return useQuery<PlaylistWithCount>({
    queryKey: ["/api/playlists", id],
    enabled: !!id,
  });
}

export function useDJRecommendations() {
  return useQuery<DJRecommendation[]>({
    queryKey: ["/api/dj/recommendations"],
  });
}

export function useCreatePlaylist() {
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; isPublic?: boolean }) => {
      const res = await apiRequest("POST", "/api/playlists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
    },
  });
}

export function useUpdatePlaylist() {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; isPublic?: boolean; coverImage?: string }) => {
      const res = await apiRequest("PUT", `/api/playlists/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", variables.id] });
    },
  });
}

export function useDeletePlaylist() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/playlists/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
    },
  });
}

export function useAddToPlaylist() {
  return useMutation({
    mutationFn: async ({ playlistId, book }: { 
      playlistId: string; 
      book: { bookId: string; bookTitle: string; bookAuthor?: string; bookCover?: string } 
    }) => {
      const res = await apiRequest("POST", `/api/playlists/${playlistId}/items`, book);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", variables.playlistId] });
    },
  });
}

export function useRemoveFromPlaylist() {
  return useMutation({
    mutationFn: async ({ playlistId, bookId }: { playlistId: string; bookId: string }) => {
      const res = await apiRequest("DELETE", `/api/playlists/${playlistId}/items/${bookId}`);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", variables.playlistId] });
    },
  });
}
