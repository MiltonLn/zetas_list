import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { tournamentsService } from './tournaments.service';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

describe('tournamentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: {} });
    mockApi.post.mockResolvedValue({ data: {} });
    mockApi.patch.mockResolvedValue({ data: {} });
    mockApi.delete.mockResolvedValue({ data: {} });
  });

  it('consulta torneos con y sin filtro y obtiene el detalle', async () => {
    await tournamentsService.list();
    expect(mockApi.get).toHaveBeenLastCalledWith('/tournaments', {
      params: undefined,
    });

    await tournamentsService.list('registration_open');
    expect(mockApi.get).toHaveBeenLastCalledWith('/tournaments', {
      params: { status: 'registration_open' },
    });

    await tournamentsService.findOne('t1');
    expect(mockApi.get).toHaveBeenLastCalledWith('/tournaments/t1');
  });

  it('delega el CRUD y las transiciones de estado', async () => {
    const payload = {
      name: 'Torneo Zetas',
      format: 'groups_and_knockout' as const,
      modalidad: 'seis_x_seis' as const,
      registrationOpenAt: '2026-08-01',
      startDate: '2026-08-15',
      endDate: '2026-08-15',
      maxTeams: 8,
    };

    await tournamentsService.create(payload);
    await tournamentsService.update('t1', { name: 'Nuevo nombre' });
    await tournamentsService.openRegistration('t1');
    await tournamentsService.start('t1');
    await tournamentsService.complete('t1');
    await tournamentsService.cancel('t1');

    expect(mockApi.post).toHaveBeenCalledWith('/tournaments', payload);
    expect(mockApi.patch).toHaveBeenCalledWith('/tournaments/t1', {
      name: 'Nuevo nombre',
    });
    expect(mockApi.post).toHaveBeenCalledWith(
      '/tournaments/t1/open-registration',
    );
    expect(mockApi.post).toHaveBeenCalledWith('/tournaments/t1/start');
    expect(mockApi.post).toHaveBeenCalledWith('/tournaments/t1/complete');
    expect(mockApi.post).toHaveBeenCalledWith('/tournaments/t1/cancel');
  });

  it('administra equipos, grupos y llaves', async () => {
    const team = {
      name: 'Los Zetas',
      players: [{ userId: 'u1', isCaptain: true }],
    };
    const assignments = { team1: 'A' };
    const seeding = ['team1', 'team2'];

    await tournamentsService.registerTeam('t1', team);
    await tournamentsService.removeTeam('t1', 'team1');
    await tournamentsService.updateTeamPayment('t1', 'team1', true);
    await tournamentsService.getStandings('t1');
    await tournamentsService.getBracketPreview('t1');
    await tournamentsService.assignGroups('t1', assignments);
    await tournamentsService.generateGroupMatches('t1');
    await tournamentsService.generateKnockoutBracket('t1', seeding);
    await tournamentsService.advanceWinners('t1');

    expect(mockApi.post).toHaveBeenCalledWith('/tournaments/t1/teams', team);
    expect(mockApi.delete).toHaveBeenCalledWith(
      '/tournaments/t1/teams/team1',
    );
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/tournaments/t1/teams/team1/payment',
      { paid: true },
    );
    expect(mockApi.get).toHaveBeenCalledWith('/tournaments/t1/standings');
    expect(mockApi.get).toHaveBeenCalledWith('/tournaments/t1/bracket-preview');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/tournaments/t1/assign-groups',
      { assignments },
    );
    expect(mockApi.post).toHaveBeenCalledWith(
      '/tournaments/t1/generate-matches',
    );
    expect(mockApi.post).toHaveBeenCalledWith(
      '/tournaments/t1/generate-bracket',
      { seeding },
    );
    expect(mockApi.post).toHaveBeenCalledWith(
      '/tournaments/t1/advance-winners',
    );
  });

  it('carga archivos y actualiza partidos', async () => {
    const rules = new File(['rules'], 'rules.pdf', {
      type: 'application/pdf',
    });
    const flyer = new File(['image'], 'flyer.jpg', {
      type: 'image/jpeg',
    });
    const sets = [{ setNumber: 1, scoreA: 25, scoreB: 20 }];

    await tournamentsService.uploadRulesPdf('t1', rules);
    await tournamentsService.uploadFlyer('t1', flyer);
    await tournamentsService.cancelMatch('m1');
    await tournamentsService.updateMatchScore('m1', sets);

    const rulesForm = mockApi.post.mock.calls.find(
      ([url]) => url === '/tournaments/t1/rules-pdf',
    )?.[1] as FormData;
    const flyerForm = mockApi.post.mock.calls.find(
      ([url]) => url === '/tournaments/t1/flyer',
    )?.[1] as FormData;
    expect(rulesForm.get('file')).toBe(rules);
    expect(flyerForm.get('file')).toBe(flyer);
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/tournaments/matches/m1/cancel',
    );
    expect(mockApi.patch).toHaveBeenCalledWith('/tournaments/matches/m1', {
      sets,
    });
  });
});
