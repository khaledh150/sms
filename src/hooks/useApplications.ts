// src/hooks/useApplications.ts — React Query wrappers for applications
import { useQuery } from "@tanstack/react-query";
import {
  fetchPendingApplications,
  fetchPendingChanges,
  countPendingReviews,
} from "../services/applications";

export function usePendingApplications() {
  return useQuery({
    queryKey: ["applications", "pending"],
    queryFn: fetchPendingApplications,
    staleTime: 20_000,
  });
}

export function usePendingChanges() {
  return useQuery({
    queryKey: ["application_changes", "pending"],
    queryFn: fetchPendingChanges,
    staleTime: 20_000,
  });
}

export function usePendingReviewCount(enabled = true) {
  return useQuery({
    queryKey: ["review_count"],
    queryFn: countPendingReviews,
    staleTime: 10_000,
    enabled,
    initialData: 0,
  });
}
