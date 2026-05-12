import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ListeningHistory } from "@shared/schema";

export function useListeningHistory(limit = 50) {
  return useQuery<ListeningHistory[]>({
    queryKey: ["/api/history", limit],
    enabled: true,
    staleTime: 30000,
  });
}

export function useContinueListening(limit = 10) {
  return useQuery<ListeningHistory[]>({
    queryKey: ["/api/history/continue", limit],
    enabled: true,
    staleTime: 30000,
  });
}

export function useUpdateProgress() {
  return useMutation({
    mutationFn: async (data: {
      bookId: string;
      currentTime: number;
      bookTitle: string;
      bookAuthor?: string;
      bookCover?: string;
      totalDuration?: number;
    }) => {
      const response = await apiRequest("POST", "/api/history/progress", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/history/continue"] });
    },
  });
}
