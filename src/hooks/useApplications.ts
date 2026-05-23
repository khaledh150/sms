import { useQuery } from "@tanstack/react-query";
import { STALE } from "../constants";
import {
  fetchPendingApplications,
  fetchPendingChanges,
  countPendingReviews,
} from "../services/applications";

export function usePendingApplications() {
  return useQuery({
    queryKey: ["applications", "pending"],
    queryFn: fetchPendingApplications,
    staleTime: STALE.FAST,
  });
}

export function usePendingChanges() {
  return useQuery({
    queryKey: ["application_changes", "pending"],
    queryFn: fetchPendingChanges,
    staleTime: STALE.FAST,
  });
}

export function usePendingReviewCount(enabled = true) {
  return useQuery({
    queryKey: ["review_count"],
    queryFn: countPendingReviews,
    staleTime: STALE.FAST,
    enabled,
    initialData: 0,
  });
}
