function createListenerMap(service) {
  return {
    taskCreated: (data) => service._handleTaskCreated(data),
    taskCompleted: (data) => service._handleTaskCompleted(data),
    taskUpdated: (data) => service._handleTaskUpdated(data),
    taskDeleted: (data) => service._handleTaskDeleted(data),
    taskStatusUpdated: (data) => service._handleTaskStatusUpdated(data),
    taskUpcoming: (data) => service._handleUpcomingTask(data),
    taskPenaltyApplied: (data) => service._handleTaskPenalty(data),
    taskMarkedRequired: (data) => service._handleTaskMarkedRequired(data),
    taskUnmarkedRequired: (data) => service._handleTaskUnmarkedRequired(data),
    rewardCreated: (data) => service._handleRewardCreated(data),
    rewardClaimed: (data) => service._handleRewardClaimed(data),
    rewardDelivered: (data) => service._handleRewardDelivered(data),
    rewardUnclaimed: (data) => service._handleRewardUnclaimed(data),
    rewardDeletedBatch: (data) => service._handleRewardDeletedBatch(data),
    rewardExamplesCleared: (data) => service._handleRewardExamplesCleared(data),
    taskCloudSyncFailed: (data) => service._handleTaskCloudSyncFailed(data),
    rewardCloudSyncFailed: (data) => service._handleRewardCloudSyncFailed(data),
    domainMessageCreated: (data) => service._handleDomainMessageCreated(data),
    domainMessageUpdated: (data) => service._handleDomainMessageUpdated(data),
    domainMessageDeleted: (data) => service._handleDomainMessageDeleted(data),
    domainMessageRead: (data) => service._handleDomainMessageRead(data),
    domainMessageAllRead: (data) => service._handleDomainMessageAllRead(data)
  };
}

module.exports = {
  createListenerMap
};
