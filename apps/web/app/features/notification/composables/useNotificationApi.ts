import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  NotificationManyResponse,
  NotificationResponse,
  NotificationUnreadResponse,
} from '~/features/notification/types';
import { extractErrorMessage } from '~/features/workflow/composables/useWorkflowApi';

const LIST_LIMIT = 10;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};

export function useGetUnreadNotificationCount() {
  const api = useApi();
  return useQuery<NotificationUnreadResponse>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: ({ signal }) =>
      api('/notification/unread-count', { method: 'GET', signal }),
    refetchInterval: 30_000,
  });
}

export function useGetNotificationList(open: MaybeRefOrGetter<boolean> = true) {
  const api = useApi();
  return useQuery<NotificationManyResponse>({
    queryKey: notificationKeys.list(),
    queryFn: ({ signal }) =>
      api('/notification', {
        method: 'GET',
        query: { page: 1, limit: LIST_LIMIT },
        signal,
      }),
    enabled: () => toValue(open),
  });
}

export function useMarkReadNotification() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<NotificationResponse, unknown, string>({
    mutationFn: (notificationId) =>
      api(`/notification/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, 'Failed to mark notification as read'),
      );
    },
  });
}

export function useMarkAllReadNotification() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ count: number }, unknown, void>({
    mutationFn: () => api('/notification/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, 'Failed to mark all notifications as read'),
      );
    },
  });
}

export function useDeleteNotification() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, unknown, string>({
    mutationFn: (notificationId) =>
      api(`/notification/${notificationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete notification'));
    },
  });
}

export function useDeleteAllNotifications() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ count: number }, unknown, void>({
    mutationFn: () => api('/notification', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, 'Failed to delete all notifications'),
      );
    },
  });
}
