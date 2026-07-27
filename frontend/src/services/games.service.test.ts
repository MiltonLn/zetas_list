import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';
import { gamesService } from './games.service';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

describe('gamesService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('previewReport', () => {
    it('calls GET /games/:id/preview-report', async () => {
      const payload = {
        report: 'Reporte...',
        fineable: [{ regId: 'r1', userId: 'u1', name: 'Pepe', fineExempt: false }],
      };
      mockApi.get.mockResolvedValue({ data: payload });

      const result = await gamesService.previewReport('g1');

      expect(mockApi.get).toHaveBeenCalledWith('/games/g1/preview-report');
      expect(result.data).toEqual(payload);
    });
  });

  describe('setFineExempt', () => {
    it('calls PATCH /games/:id/registrations/:regId/fine-exempt', async () => {
      mockApi.patch.mockResolvedValue({ data: {} });

      await gamesService.setFineExempt('g1', 'r1', true);

      expect(mockApi.patch).toHaveBeenCalledWith(
        '/games/g1/registrations/r1/fine-exempt',
        { exempt: true },
      );
    });
  });

  describe('getReport', () => {
    it('calls GET /games/:id/report', async () => {
      mockApi.get.mockResolvedValue({ data: { report: 'text' } });

      const result = await gamesService.getReport('g1');

      expect(mockApi.get).toHaveBeenCalledWith('/games/g1/report');
      expect(result.data.report).toBe('text');
    });
  });

  describe('complete', () => {
    it('calls POST /games/:id/complete', async () => {
      mockApi.post.mockResolvedValue({ data: {} });

      await gamesService.complete('g1');

      expect(mockApi.post).toHaveBeenCalledWith('/games/g1/complete');
    });
  });

  describe('demote', () => {
    it('calls POST /games/:id/demote/:regId', async () => {
      mockApi.post.mockResolvedValue({ data: {} });

      await gamesService.demote('g1', 'r1');

      expect(mockApi.post).toHaveBeenCalledWith('/games/g1/demote/r1');
    });
  });

  describe('getAudit', () => {
    it('calls GET /games/:id/audit', async () => {
      mockApi.get.mockResolvedValue({ data: [] });

      await gamesService.getAudit('g1');

      expect(mockApi.get).toHaveBeenCalledWith('/games/g1/audit');
    });
  });

  describe('generateTeams', () => {
    it('calls POST /games/:id/teams/generate', async () => {
      mockApi.post.mockResolvedValue({ data: {} });

      await gamesService.generateTeams('g1');

      expect(mockApi.post).toHaveBeenCalledWith('/games/g1/teams/generate');
    });
  });

  describe('sendTeamsWhatsapp', () => {
    it('calls POST /games/:id/teams/send-whatsapp', async () => {
      mockApi.post.mockResolvedValue({ data: { sent: true } });

      const result = await gamesService.sendTeamsWhatsapp('g1');

      expect(mockApi.post).toHaveBeenCalledWith('/games/g1/teams/send-whatsapp');
      expect(result.data.sent).toBe(true);
    });
  });

  describe('list', () => {
    it('forwards query params', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 10 } });

      await gamesService.list({ status: 'completed', page: 2 });

      expect(mockApi.get).toHaveBeenCalledWith('/games', {
        params: { status: 'completed', page: 2 },
      });
    });
  });
});
