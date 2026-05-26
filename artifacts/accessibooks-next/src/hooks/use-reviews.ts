import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReviewWithUser, AggregatedRatings, Author } from "@shared/schema";

export function useBookReviews(bookId: string) {
  return useQuery<ReviewWithUser[]>({
    queryKey: ["/api/books", bookId, "reviews"],
    queryFn: async () => {
      const response = await fetch(`/api/books/${bookId}/reviews`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch reviews");
      return response.json();
    },
    enabled: !!bookId,
  });
}

export function useAggregatedRatings(bookId: string, title: string, author: string) {
  return useQuery<AggregatedRatings>({
    queryKey: ["/api/books", bookId, "ratings"],
    queryFn: async () => {
      const params = new URLSearchParams({ title, author });
      const response = await fetch(`/api/books/${bookId}/ratings?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch ratings");
      return response.json();
    },
    enabled: !!bookId && !!title && !!author,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { bookId: string; rating: number; title?: string; content?: string }) => {
      const response = await apiRequest("POST", "/api/reviews", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create review");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "ratings"] });
      toast({ title: "Review posted", description: "Your review has been shared." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateReview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { id: string; bookId: string; rating?: number; title?: string; content?: string }) => {
      const { id, bookId, ...updates } = data;
      const response = await apiRequest("PUT", `/api/reviews/${id}`, updates);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update review");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "reviews"] });
      toast({ title: "Review updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { id: string; bookId: string }) => {
      const response = await apiRequest("DELETE", `/api/reviews/${data.id}`, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete review");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "ratings"] });
      toast({ title: "Review deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useToggleReviewLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { reviewId: string; bookId: string }) => {
      const response = await apiRequest("POST", `/api/reviews/${data.reviewId}/like`, {});
      if (!response.ok) throw new Error("Failed to toggle like");
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", variables.bookId, "reviews"] });
    },
  });
}

export function useFollowUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/users/${userId}/follow`, {});
      if (!response.ok) throw new Error("Failed to follow user");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({ title: "Following", description: "You will see their reviews in your feed." });
    },
  });
}

export function useUnfollowUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}/follow`, {});
      if (!response.ok) throw new Error("Failed to unfollow user");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
  });
}

export function useIsFollowing(userId: string) {
  return useQuery<{ following: boolean }>({
    queryKey: ["/api/users", userId, "is-following"],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/is-following`, { credentials: "include" });
      if (!response.ok) return { following: false };
      return response.json();
    },
    enabled: !!userId,
  });
}

export function useSocialFeed(limit = 20) {
  return useQuery<ReviewWithUser[]>({
    queryKey: ["/api/feed"],
    queryFn: async () => {
      const response = await fetch(`/api/feed?limit=${limit}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch feed");
      return response.json();
    },
  });
}

export function useAuthor(authorName: string) {
  return useQuery<Author>({
    queryKey: ["/api/authors", authorName],
    queryFn: async () => {
      const response = await fetch(`/api/authors/${encodeURIComponent(authorName)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Author not found");
      return response.json();
    },
    enabled: !!authorName,
    staleTime: 1000 * 60 * 60,
  });
}

export function useAuthorWorks(authorName: string) {
  return useQuery<{ author: Author; works: any[] }>({
    queryKey: ["/api/authors", authorName, "works"],
    queryFn: async () => {
      const response = await fetch(`/api/authors/${encodeURIComponent(authorName)}/works`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch author works");
      return response.json();
    },
    enabled: !!authorName,
    staleTime: 1000 * 60 * 60,
  });
}
