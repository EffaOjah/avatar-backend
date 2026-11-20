import {
  AdminContentService,
  AdminReviewsService,
  AdminAbuseReportsService,
  AdminUserRestrictionsService,
  AdminModerationAppealsService,
  AdminBlockedTermsService,
  AdminModerationAnalyticsService,
} from '../admin-moderation.service';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    feedPost: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    story: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    review: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    abuseReport: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    moderationAction: {
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    moderationAppeal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    userRestriction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    blockedTerm: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    platformSetting: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('Moderation Admin Services (MD-01 to MD-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      return Promise.all(cb);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Feed & Stories Moderation
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminContentService', () => {
    it('moderatePost requires reasonCode when action is REMOVE', async () => {
      (prisma.feedPost.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', status: 'ACTIVE' });

      await expect(
        AdminContentService.moderatePost('p-1', 'REMOVE', undefined, 'No reason given', 'mod-1', 'MODERATION_ADMIN'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('moderatePost updates post status and creates ModerationAction', async () => {
      (prisma.feedPost.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', authorId: 'u-1', status: 'ACTIVE' });
      (prisma.feedPost.update as jest.Mock).mockResolvedValue({ id: 'p-1', status: 'REMOVED' });

      const res = await AdminContentService.moderatePost(
        'p-1',
        'REMOVE',
        'NUDITY',
        'Explicit image reported',
        'mod-1',
        'MODERATION_ADMIN',
      );

      expect(res.status).toBe('REMOVED');
      expect(prisma.moderationAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REMOVE',
            reasonCode: 'NUDITY',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('removeStory sets REMOVED status and logs moderation action', async () => {
      (prisma.story.findUnique as jest.Mock).mockResolvedValue({ id: 's-1', authorId: 'u-1', status: 'ACTIVE' });
      (prisma.story.update as jest.Mock).mockResolvedValue({ id: 's-1', status: 'REMOVED' });

      const res = await AdminContentService.removeStory('s-1', 'SPAM', 'Promotional spam', 'mod-1', 'MODERATION_ADMIN');
      expect(res.status).toBe('REMOVED');
      expect(prisma.moderationAction.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Reviews Moderation
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminReviewsService', () => {
    it('moderateReview flags review as suspicious', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ id: 'r-1', authorId: 'u-1', status: 'ACTIVE' });
      (prisma.review.update as jest.Mock).mockResolvedValue({ id: 'r-1', isSuspicious: true });

      const res = await AdminReviewsService.moderateReview(
        'r-1',
        'FLAG_SUSPICIOUS',
        'OTHER',
        'Suspected competitor sabotage',
        'mod-1',
        'MODERATION_ADMIN',
      );

      expect(res.isSuspicious).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Abuse Reports & Strikes
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminAbuseReportsService', () => {
    it('resolveReport with STRIKE computes cumulative strikes and escalates when threshold breached', async () => {
      (prisma.abuseReport.findUnique as jest.Mock).mockResolvedValue({
        id: 'rep-1',
        targetType: 'USER',
        targetId: 'user-violator',
        reason: 'HARASSMENT',
      });
      (prisma.moderationAction.count as jest.Mock).mockResolvedValue(3); // 3 strikes
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'moderation_strike_thresholds',
        value: '3',
      });
      (prisma.abuseReport.update as jest.Mock).mockResolvedValue({
        id: 'rep-1',
        status: 'ESCALATED',
        resolution: 'STRIKE',
      });

      const res = await AdminAbuseReportsService.resolveReport(
        'rep-1',
        { resolution: 'STRIKE', notes: 'Repeated harassment behavior' },
        'mod-1',
        'MODERATION_ADMIN',
      );

      expect(res.thresholdBreached).toBe(true);
      expect(res.strikeCount).toBe(3);
      expect(prisma.abuseReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ESCALATED',
          }),
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // User Restrictions
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminUserRestrictionsService', () => {
    it('applyRestriction validates future date and creates restriction record', async () => {
      const future = new Date(Date.now() + 7 * 24 * 3600_000);
      (prisma.userRestriction.create as jest.Mock).mockResolvedValue({
        id: 'res-1',
        userId: 'u-1',
        type: 'COMMENTING',
        isActive: true,
      });

      const res = await AdminUserRestrictionsService.applyRestriction(
        'u-1',
        { type: 'COMMENTING', reason: 'Spamming review section', restrictedUntil: future.toISOString() },
        'mod-1',
        'MODERATION_ADMIN',
      );

      expect(res.id).toBe('res-1');
      expect(prisma.moderationAction.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Appeals
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminModerationAppealsService', () => {
    it('decideAppeal rejects when original moderator attempts to review own decision', async () => {
      (prisma.moderationAppeal.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        status: 'PENDING',
        originalModeratorId: 'mod-1', // Same as decider
        action: { id: 'act-1', targetType: 'FEED_POST', targetId: 'p-1' },
      });

      await expect(
        AdminModerationAppealsService.decideAppeal('app-1', 'APPROVED', 'Mistake verified', 'mod-1', 'MODERATION_ADMIN'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('decideAppeal restores post when APPROVED by second moderator', async () => {
      (prisma.moderationAppeal.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        status: 'PENDING',
        originalModeratorId: 'mod-1', // Different from mod-2
        action: { id: 'act-1', targetType: 'FEED_POST', targetId: 'p-1' },
      });
      (prisma.feedPost.update as jest.Mock).mockResolvedValue({});
      (prisma.moderationAction.update as jest.Mock).mockResolvedValue({});
      (prisma.moderationAppeal.update as jest.Mock).mockResolvedValue({
        id: 'app-1',
        status: 'APPROVED',
      });

      const res = await AdminModerationAppealsService.decideAppeal(
        'app-1',
        'APPROVED',
        'Content complies with updated guidelines',
        'mod-2',
        'MODERATION_ADMIN',
      );

      expect(res.status).toBe('APPROVED');
      expect(prisma.feedPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Blocked Terms
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminBlockedTermsService', () => {
    it('adds and lists blocked terms', async () => {
      (prisma.blockedTerm.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.blockedTerm.create as jest.Mock).mockResolvedValue({ id: 'bt-1', term: 'badword' });
      (prisma.blockedTerm.findMany as jest.Mock).mockResolvedValue([{ id: 'bt-1', term: 'badword' }]);

      const created = await AdminBlockedTermsService.addTerm('badword', undefined, 'PROFANITY', 'mod-1');
      expect(created.id).toBe('bt-1');

      const terms = await AdminBlockedTermsService.listTerms();
      expect(terms).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Moderation Analytics
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminModerationAnalyticsService', () => {
    it('computes moderation actions and appeal overturn rate', async () => {
      (prisma.moderationAction.count as jest.Mock)
        .mockResolvedValueOnce(120) // totalActions
        .mockResolvedValueOnce(15);  // strikesIssued
      (prisma.moderationAction.groupBy as jest.Mock).mockResolvedValue([
        { reasonCode: 'SPAM', _count: { id: 80 } },
      ]);
      (prisma.abuseReport.count as jest.Mock).mockResolvedValue(8);
      (prisma.moderationAppeal.count as jest.Mock)
        .mockResolvedValueOnce(20) // totalAppeals
        .mockResolvedValueOnce(5);  // approvedAppeals

      const metrics = await AdminModerationAnalyticsService.getModerationMetrics({});
      expect(metrics.overview.totalActions).toBe(120);
      expect(metrics.overview.strikesIssued).toBe(15);
      expect(metrics.overview.totalAppeals).toBe(20);
      expect(metrics.overview.overturnRate).toBe(25); // 5 / 20 * 100
      expect(metrics.removalsByReason[0].reasonCode).toBe('SPAM');
    });
  });
});
