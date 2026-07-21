import type {
  Notification,
  NotificationDataMap,
  NotificationType,
} from '~/features/notification/types';

export interface UINotification {
  title: string;
  message: string;
  to: string | null;
  workspaceId: string | null;
}

interface NotificationTemplate {
  titleKey: string;
  messageKey: string;
  params: Record<string, unknown>;
  to: string | null;
  workspaceId: string | null;
}

type TemplateBuilder<T extends NotificationType> = (
  data: NotificationDataMap[T],
) => NotificationTemplate;

const templateBuilders: { [T in NotificationType]: TemplateBuilder<T> } = {
  workflow_run_succeeded: (data) => ({
    titleKey: 'notification.workflowRunSucceeded.title',
    messageKey: 'notification.workflowRunSucceeded.message',
    params: { name: data.workflowName },
    to: `/workflow/${data.workflowId}`,
    workspaceId: data.workspaceId,
  }),
  workflow_run_failed: (data) => ({
    titleKey: 'notification.workflowRunFailed.title',
    messageKey: 'notification.workflowRunFailed.message',
    params: { name: data.workflowName },
    to: `/workflow/${data.workflowId}`,
    workspaceId: data.workspaceId,
  }),
  task_reminder_due: (data) => ({
    titleKey: 'notification.taskReminderDue.title',
    messageKey: 'notification.taskReminderDue.message',
    params: {
      displayId: `TSK-${data.taskNumber}`,
      title: data.taskTitle,
    },
    to: `/tasks/${data.taskId}`,
    workspaceId: data.workspaceId,
  }),
};

const fallbackTemplate: NotificationTemplate = {
  titleKey: 'notification.unknown.title',
  messageKey: 'notification.unknown.message',
  params: {},
  to: null,
  workspaceId: null,
};

function isSupportedNotificationType(type: string): type is NotificationType {
  return Object.hasOwn(templateBuilders, type);
}

function getTemplateForType<T extends NotificationType>(
  type: T,
  data: Record<string, unknown>,
): NotificationTemplate {
  // `data` is untyped JSON. The producer writes `type` + `data` as a matched
  // pair, so this cast safely restores the specific payload shape.
  return templateBuilders[type](data as NotificationDataMap[T]);
}

function buildNotificationTemplate(
  notification: Notification,
): NotificationTemplate {
  const { type, data } = notification;
  if (!isSupportedNotificationType(type)) {
    return fallbackTemplate;
  }

  return getTemplateForType(type, data ?? {});
}

export default function useNotificationParser() {
  const { t } = useI18n();

  function formatNotificationForUi(notification: Notification): UINotification {
    const template = buildNotificationTemplate(notification);

    return {
      title: t(template.titleKey, template.params),
      message: t(template.messageKey, template.params),
      to: template.to,
      workspaceId: template.workspaceId,
    };
  }

  return {
    formatNotificationForUi,
  };
}
