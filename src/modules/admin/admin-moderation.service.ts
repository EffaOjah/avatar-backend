/**
 * Moderation Admin Services — TRD §5.5 (MD-01 to MD-08) & §6.11
 *
 * Services:
 *  - AdminContentService          : Feed & stories moderation (MD-01, MD-02)
 *  - AdminReviewsService          : Reviews & ratings moderation, fake/suspicious review flagging (MD-04)
 *  - AdminAbuseReportsService     : Prioritized report queue, strikes accumulation & escalation (MD-03, MD-05, MD-06)
 *  - AdminUserRestrictionsService : Time-limited posting/commenting account restrictions (MD-05)
 *  - AdminModerationAppealsService: Content removal appeals reviewed by a second moderator (MD-07)
 *  - AdminBlockedTermsService     : Management of keywords & regex patterns for review flagging (MD-08)
 *  - AdminModerationAnalyticsService: Turnaround time, strike counts, removals by reason code
 */

import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

async function getSettingValue(key: string, defaultValue: string): Promise<string> {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value ?? defaultValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-01 & MD-02 — Feed & Stories Moderation
// ─────────────────────────────────────────────────────────────────────────────

export class AdminContentService {
  static async listFeedPosts(filters: {
    status?: string;
    authorId?: string;
    businessId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, authorId, businessId, cursor, limit = 20 } = filters;

    const posts = await prisma.feedPost.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(authorId ? { authorId } : {}),
        ...(businessId ? { businessId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;
    return { posts, meta: { cursor: nextCursor, limit } };
  }

  static async moderatePost(
    postId: string,
    action: 'HIDE' | 'REMOVE' | 'RESTORE',
    reasonCode: string | undefined,
    details: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const post = await prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post) throw Object.assign(new Error('Feed post not found'), { status: 404 });

    if (action === 'REMOVE' && !reasonCode) {
      throw Object.assign(new Error('reasonCode is mandatory when removing content'), { status: 400 });
    }

    const before = { status: post.status };
    const newStatus = action === 'RESTORE' ? 'ACTIVE' : action === 'HIDE' ? 'HIDDEN' : 'REMOVED';

    const updated = await prisma.feedPost.update({
      where: { id: postId },
      data: {
        status: newStatus as any,
        ...(action === 'REMOVE'
          ? { removedAt: new Date(), removedBy: actorId, reasonCode }
          : action === 'RESTORE'
          ? { removedAt: null, removedBy: null, reasonCode: null }
          : {}),
      },
    });

    // Record moderation action history
    await prisma.moderationAction.create({
      data: {
        targetType: 'FEED_POST',
        targetId: postId,
        userId: post.authorId,
        action: action as any,
        reasonCode: (reasonCode ?? 'OTHER') as any,
        details: details ?? `Action ${action} applied by moderator`,
        moderatorId: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: `content.post.${action.toLowerCase()}`,
      entityType: 'FeedPost',
      entityId: postId,
      before,
      after: { status: newStatus, reasonCode },
      reason: details ?? `Post ${action.toLowerCase()} by moderator`,
      ip,
      requestId,
    });

    return updated;
  }

  static async listStories(filters: { status?: string; expired?: boolean; cursor?: string; limit?: number }) {
    const { status, expired, cursor, limit = 20 } = filters;
    const now = new Date();

    const expiryFilter =
      expired === true ? { expiresAt: { lt: now } } : expired === false ? { expiresAt: { gte: now } } : {};

    const stories = await prisma.story.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...expiryFilter,
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = stories.length === limit ? stories[stories.length - 1].id : null;
    return { stories, meta: { cursor: nextCursor, limit } };
  }

  static async removeStory(
    storyId: string,
    reasonCode: string,
    details: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw Object.assign(new Error('Story not found'), { status: 404 });

    const before = { status: story.status };
    const updated = await prisma.story.update({
      where: { id: storyId },
      data: {
        status: 'REMOVED',
        removedAt: new Date(),
        removedBy: actorId,
        reasonCode,
      },
    });

    await prisma.moderationAction.create({
      data: {
        targetType: 'STORY',
        targetId: storyId,
        userId: story.authorId,
        action: 'REMOVE',
        reasonCode: (reasonCode ?? 'OTHER') as any,
        details: details ?? 'Story removed by moderator',
        moderatorId: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'content.story.remove',
      entityType: 'Story',
      entityId: storyId,
      before,
      after: { status: 'REMOVED', reasonCode },
      reason: details ?? 'Story removed by moderator',
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-04 — Reviews & Comments Moderation
// ─────────────────────────────────────────────────────────────────────────────

export class AdminReviewsService {
  static async listReviews(filters: {
    status?: string;
    isSuspicious?: boolean;
    businessId?: string;
    riderId?: string;
    minRating?: number;
    maxRating?: number;
    cursor?: string;
    limit?: number;
  }) {
    const { status, isSuspicious, businessId, riderId, minRating, maxRating, cursor, limit = 20 } = filters;

    const ratingFilter =
      minRating !== undefined || maxRating !== undefined
        ? {
            rating: {
              ...(minRating !== undefined ? { gte: minRating } : {}),
              ...(maxRating !== undefined ? { lte: maxRating } : {}),
            },
          }
        : {};

    const reviews = await prisma.review.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(isSuspicious !== undefined ? { isSuspicious } : {}),
        ...(businessId ? { businessId } : {}),
        ...(riderId ? { riderId } : {}),
        ...ratingFilter,
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = reviews.length === limit ? reviews[reviews.length - 1].id : null;
    return { reviews, meta: { cursor: nextCursor, limit } };
  }

  static async moderateReview(
    reviewId: string,
    action: 'HIDE' | 'REMOVE' | 'RESTORE' | 'FLAG_SUSPICIOUS',
    reasonCode: string | undefined,
    details: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw Object.assign(new Error('Review not found'), { status: 404 });

    const before = { status: review.status, isSuspicious: review.isSuspicious };
    let dataToUpdate: Record<string, unknown> = {};

    if (action === 'FLAG_SUSPICIOUS') {
      dataToUpdate = { isSuspicious: true };
    } else {
      const newStatus = action === 'RESTORE' ? 'ACTIVE' : action === 'HIDE' ? 'HIDDEN' : 'REMOVED';
      dataToUpdate = {
        status: newStatus as any,
        ...(action === 'REMOVE'
          ? { removedAt: new Date(), removedBy: actorId, reasonCode }
          : action === 'RESTORE'
          ? { removedAt: null, removedBy: null, reasonCode: null }
          : {}),
      };
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: dataToUpdate,
    });

    await prisma.moderationAction.create({
      data: {
        targetType: 'REVIEW',
        targetId: reviewId,
        userId: review.authorId,
        action: action === 'FLAG_SUSPICIOUS' ? 'HIDE' : (action as any),
        reasonCode: (reasonCode ?? 'OTHER') as any,
        details: details ?? `Review action ${action} applied`,
        moderatorId: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: `content.review.${action.toLowerCase()}`,
      entityType: 'Review',
      entityId: reviewId,
      before,
      after: dataToUpdate,
      reason: details ?? `Review ${action.toLowerCase()} by moderator`,
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-03, MD-05, MD-06 — Abuse Reports & Strikes
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAbuseReportsService {
  static async listReports(filters: {
    status?: string;
    targetType?: string;
    reason?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, targetType, reason, cursor, limit = 20 } = filters;

    const reports = await prisma.abuseReport.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(targetType ? { targetType: targetType as any } : {}),
        ...(reason ? { reason: reason as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = reports.length === limit ? reports[reports.length - 1].id : null;
    return { reports, meta: { cursor: nextCursor, limit } };
  }

  /**
   * Resolve an abuse report: DISMISS, REMOVE, STRIKE, or ESCALATE.
   * If STRIKE is applied, computes cumulative strikes and triggers escalation if threshold reached.
   */
  static async resolveReport(
    reportId: string,
    data: {
      resolution: 'DISMISSED' | 'REMOVED' | 'STRIKE' | 'ESCALATE';
      reasonCode?: string;
      notes?: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const report = await prisma.abuseReport.findUnique({ where: { id: reportId } });
    if (!report) throw Object.assign(new Error('Abuse report not found'), { status: 404 });

    const { resolution, reasonCode, notes } = data;
    const finalReason = reasonCode ?? report.reason;

    let targetUserId: string | null = null;
    if (report.targetType === 'USER') {
      targetUserId = report.targetId;
    } else if (report.targetType === 'FEED_POST') {
      const p = await prisma.feedPost.findUnique({ where: { id: report.targetId } });
      targetUserId = p?.authorId ?? null;
      if (resolution === 'REMOVED' || resolution === 'STRIKE') {
        await prisma.feedPost.update({
          where: { id: report.targetId },
          data: { status: 'REMOVED', removedAt: new Date(), removedBy: actorId, reasonCode: finalReason },
        });
      }
    } else if (report.targetType === 'STORY') {
      const s = await prisma.story.findUnique({ where: { id: report.targetId } });
      targetUserId = s?.authorId ?? null;
      if (resolution === 'REMOVED' || resolution === 'STRIKE') {
        await prisma.story.update({
          where: { id: report.targetId },
          data: { status: 'REMOVED', removedAt: new Date(), removedBy: actorId, reasonCode: finalReason },
        });
      }
    } else if (report.targetType === 'REVIEW') {
      const r = await prisma.review.findUnique({ where: { id: report.targetId } });
      targetUserId = r?.authorId ?? null;
      if (resolution === 'REMOVED' || resolution === 'STRIKE') {
        await prisma.review.update({
          where: { id: report.targetId },
          data: { status: 'REMOVED', removedAt: new Date(), removedBy: actorId, reasonCode: finalReason },
        });
      }
    }

    // If STRIKE resolution, record strike action and check threshold
    let strikeCount = 0;
    let thresholdBreached = false;

    if (resolution === 'STRIKE' && targetUserId) {
      await prisma.moderationAction.create({
        data: {
          targetType: report.targetType,
          targetId: report.targetId,
          userId: targetUserId,
          action: 'STRIKE',
          reasonCode: finalReason as any,
          details: notes ?? 'Strike issued for violation',
          moderatorId: actorId,
        },
      });

      strikeCount = await prisma.moderationAction.count({
        where: { userId: targetUserId, action: 'STRIKE' },
      });

      const strikeThresholdStr = await getSettingValue('moderation_strike_thresholds', '3');
      const strikeThreshold = parseInt(strikeThresholdStr, 10) || 3;
      thresholdBreached = strikeCount >= strikeThreshold;
    }

    const newReportStatus = resolution === 'ESCALATE' || thresholdBreached ? 'ESCALATED' : 'RESOLVED';

    const updated = await prisma.abuseReport.update({
      where: { id: reportId },
      data: {
        status: newReportStatus,
        resolution,
        resolvedBy: actorId,
        resolvedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: `moderation.report.resolve`,
      entityType: 'AbuseReport',
      entityId: reportId,
      after: { resolution, status: newReportStatus, strikeCount, thresholdBreached },
      reason: notes ?? `Report resolved as ${resolution}`,
      ip,
      requestId,
    });

    return { ...updated, strikeCount, thresholdBreached };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-05 — User Restrictions
// ─────────────────────────────────────────────────────────────────────────────

export class AdminUserRestrictionsService {
  static async applyRestriction(
    userId: string,
    data: {
      type: 'POSTING' | 'COMMENTING' | 'ALL';
      reason: string;
      restrictedUntil: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { type, reason, restrictedUntil } = data;

    const untilDate = new Date(restrictedUntil);
    if (isNaN(untilDate.getTime()) || untilDate <= new Date()) {
      throw Object.assign(new Error('restrictedUntil must be a valid future ISO 8601 datetime'), { status: 400 });
    }

    const restriction = await prisma.userRestriction.create({
      data: {
        userId,
        type,
        reason,
        restrictedUntil: untilDate,
        appliedBy: actorId,
        isActive: true,
      },
    });

    await prisma.moderationAction.create({
      data: {
        targetType: 'USER',
        targetId: userId,
        userId,
        action: 'RESTRICTION',
        reasonCode: 'OTHER',
        details: `Restricted ${type} until ${untilDate.toISOString()}: ${reason}`,
        moderatorId: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.restrict',
      entityType: 'User',
      entityId: userId,
      after: { restrictionId: restriction.id, type, restrictedUntil: untilDate },
      reason,
      ip,
      requestId,
    });

    return restriction;
  }

  static async listRestrictions(userId?: string) {
    return prisma.userRestriction.findMany({
      where: {
        ...(userId ? { userId } : {}),
        isActive: true,
        restrictedUntil: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-07 — Appeals
// ─────────────────────────────────────────────────────────────────────────────

export class AdminModerationAppealsService {
  static async listAppeals(filters: { status?: string; cursor?: string; limit?: number }) {
    const { status, cursor, limit = 20 } = filters;

    const appeals = await prisma.moderationAppeal.findMany({
      where: status ? { status: status as any } : {},
      include: {
        action: true,
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = appeals.length === limit ? appeals[appeals.length - 1].id : null;
    return { appeals, meta: { cursor: nextCursor, limit } };
  }

  /**
   * Decide on an appeal.
   * TRD Business Rule: A decision cannot be reversed by the same moderator who made it when it is under appeal.
   */
  static async decideAppeal(
    appealId: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const appeal = await prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      include: { action: true },
    });

    if (!appeal) throw Object.assign(new Error('Appeal not found'), { status: 404 });
    if (appeal.status !== 'PENDING') {
      throw Object.assign(new Error(`Appeal is already ${appeal.status}`), { status: 409 });
    }

    // Checker must be different from original decision-maker
    if (appeal.originalModeratorId === actorId) {
      throw Object.assign(
        new Error('Maker-checker violation: An appeal must be reviewed by a different moderator than the original decision-maker'),
        { status: 409 },
      );
    }

    return prisma.$transaction(async (tx) => {
      // If appeal is approved, restore content or reverse action
      if (decision === 'APPROVED') {
        const action = appeal.action;
        if (action.targetType === 'FEED_POST') {
          await tx.feedPost.update({
            where: { id: action.targetId },
            data: { status: 'ACTIVE', removedAt: null, removedBy: null, reasonCode: null },
          });
        } else if (action.targetType === 'STORY') {
          await tx.story.update({
            where: { id: action.targetId },
            data: { status: 'ACTIVE', removedAt: null, removedBy: null, reasonCode: null },
          });
        } else if (action.targetType === 'REVIEW') {
          await tx.review.update({
            where: { id: action.targetId },
            data: { status: 'ACTIVE', removedAt: null, removedBy: null, reasonCode: null },
          });
        }

        await tx.moderationAction.update({
          where: { id: action.id },
          data: { appealStatus: 'APPROVED' },
        });
      } else {
        await tx.moderationAction.update({
          where: { id: appeal.actionId },
          data: { appealStatus: 'REJECTED' },
        });
      }

      const updatedAppeal = await tx.moderationAppeal.update({
        where: { id: appealId },
        data: {
          status: decision,
          decidedBy: actorId,
          decidedAt: new Date(),
          decisionReason,
        },
      });

      await writeAuditLog({
        actorId,
        actorRole,
        action: `moderation.appeal.${decision.toLowerCase()}`,
        entityType: 'ModerationAppeal',
        entityId: appealId,
        after: { decision, decidedBy: actorId },
        reason: decisionReason,
        ip,
        requestId,
      });

      return updatedAppeal;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MD-08 — Blocked Terms
// ─────────────────────────────────────────────────────────────────────────────

export class AdminBlockedTermsService {
  static async listTerms() {
    return prisma.blockedTerm.findMany({ orderBy: { term: 'asc' } });
  }

  static async addTerm(term: string, pattern: string | undefined, category: string | undefined, actorId: string) {
    const existing = await prisma.blockedTerm.findUnique({ where: { term } });
    if (existing) throw Object.assign(new Error('Blocked term already exists'), { status: 409 });

    return prisma.blockedTerm.create({
      data: { term, pattern, category, createdBy: actorId },
    });
  }

  static async removeTerm(termId: string) {
    return prisma.blockedTerm.delete({ where: { id: termId } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Moderation Analytics
// ─────────────────────────────────────────────────────────────────────────────

export class AdminModerationAnalyticsService {
  static async getModerationMetrics(filters: { from?: string; to?: string }) {
    const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 30 * 24 * 3600_000);
    const to = filters.to ? new Date(filters.to) : new Date();

    const dateRange = { createdAt: { gte: from, lte: to } };

    const [
      totalActions,
      actionsByReason,
      strikesIssued,
      pendingReports,
      totalAppeals,
      approvedAppeals,
    ] = await Promise.all([
      prisma.moderationAction.count({ where: dateRange }),
      prisma.moderationAction.groupBy({
        by: ['reasonCode'],
        where: dateRange,
        _count: { id: true },
      }),
      prisma.moderationAction.count({
        where: { ...dateRange, action: 'STRIKE' },
      }),
      prisma.abuseReport.count({
        where: { ...dateRange, status: 'PENDING' },
      }),
      prisma.moderationAppeal.count({ where: dateRange }),
      prisma.moderationAppeal.count({ where: { ...dateRange, status: 'APPROVED' } }),
    ]);

    const overturnRate = totalAppeals > 0 ? parseFloat(((approvedAppeals / totalAppeals) * 100).toFixed(2)) : 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      overview: {
        totalActions,
        strikesIssued,
        pendingReports,
        totalAppeals,
        approvedAppeals,
        overturnRate,
      },
      removalsByReason: actionsByReason.map((a) => ({ reasonCode: a.reasonCode, count: a._count.id })),
    };
  }
}
