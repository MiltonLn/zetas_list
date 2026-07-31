import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  TournamentStatus,
  TournamentFormat,
  MatchStatus,
  AuditAction,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/create-tournament.dto';
import { RegisterTeamDto, UpdateTeamPaymentDto } from './dto/register-team.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import {
  applyCompetitionRuleDefaults,
  buildBracketPreview,
  calculateStandings,
  CompetitionRulesV1,
  evaluateMatchResult,
  generateRoundRobinPairs,
  MatchResultValidationError,
  parseCompetitionRules,
} from './rules';

function getTournamentInclude() {
  return {
    teams: {
      include: {
        players: { include: { user: { select: { id: true, name: true, phone: true } } } },
        registeredBy: { select: { id: true, name: true } },
      },
      orderBy: [
        { groupLabel: 'asc' as const },
        { createdAt: 'asc' as const },
      ],
    },
    matches: {
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        winner: { select: { id: true, name: true } },
        sets: { orderBy: { setNumber: 'asc' as const } },
      },
      orderBy: [
        { roundNumber: 'asc' as const },
        { matchOrder: 'asc' as const },
      ],
    },
    createdBy: { select: { id: true, name: true } },
  };
}

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(dto: CreateTournamentDto, actorId: string) {
    if (
      dto.format === TournamentFormat.groups_and_knockout &&
      dto.numberOfGroups === undefined
    ) {
      throw new BadRequestException('Debes definir el número de grupos');
    }
    const competitionRules = applyCompetitionRuleDefaults(dto.format, dto.competitionRules);
    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        format: dto.format,
        modalidad: dto.modalidad,
        registrationOpenAt: new Date(dto.registrationOpenAt),
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        pricePerTeam: dto.pricePerTeam ?? 0,
        prizeDescription: dto.prizeDescription,
        maxTeams: dto.maxTeams,
        minPlayersPerTeam: dto.minPlayersPerTeam ?? 4,
        maxPlayersPerTeam: dto.maxPlayersPerTeam ?? 8,
        minZetasMembers: dto.minZetasMembers ?? 0,
        allowExternalTeams: dto.allowExternalTeams ?? true,
        numberOfGroups:
          dto.format === TournamentFormat.league_and_knockout ? 1 : dto.numberOfGroups,
        competitionRules: competitionRules as unknown as Prisma.InputJsonValue,
        rules: dto.rules,
        rulesFileUrl: dto.rulesFileUrl,
        flyerUrl: dto.flyerUrl,
        createdById: actorId,
      },
      include: getTournamentInclude(),
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_created,
      details: { tournamentId: tournament.id, name: tournament.name },
    });

    return tournament;
  }

  async update(id: string, dto: UpdateTournamentDto, actorId: string) {
    const current = await this.findOneOrThrow(id);
    const changesStructure =
      dto.format !== undefined ||
      dto.numberOfGroups !== undefined ||
      dto.competitionRules !== undefined;
    if (changesStructure && current.status !== TournamentStatus.draft) {
      throw new BadRequestException(
        'El formato, los grupos y las reglas de competencia solo se pueden cambiar en borrador',
      );
    }
    const effectiveFormat = dto.format ?? current.format;
    const effectiveNumberOfGroups =
      effectiveFormat === TournamentFormat.league_and_knockout
        ? 1
        : dto.numberOfGroups ?? current.numberOfGroups;
    if (
      effectiveFormat === TournamentFormat.groups_and_knockout &&
      effectiveNumberOfGroups === null
    ) {
      throw new BadRequestException('Debes definir el número de grupos');
    }
    const competitionRules =
      dto.competitionRules !== undefined || dto.format !== undefined
        ? applyCompetitionRuleDefaults(effectiveFormat, dto.competitionRules)
        : undefined;

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.format && { format: dto.format }),
        ...(dto.modalidad && { modalidad: dto.modalidad }),
        ...(dto.registrationOpenAt && { registrationOpenAt: new Date(dto.registrationOpenAt) }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.pricePerTeam !== undefined && { pricePerTeam: dto.pricePerTeam }),
        ...(dto.prizeDescription !== undefined && { prizeDescription: dto.prizeDescription }),
        ...(dto.maxTeams && { maxTeams: dto.maxTeams }),
        ...(dto.minPlayersPerTeam && { minPlayersPerTeam: dto.minPlayersPerTeam }),
        ...(dto.maxPlayersPerTeam && { maxPlayersPerTeam: dto.maxPlayersPerTeam }),
        ...(dto.minZetasMembers !== undefined && { minZetasMembers: dto.minZetasMembers }),
        ...(dto.allowExternalTeams !== undefined && { allowExternalTeams: dto.allowExternalTeams }),
        ...(dto.numberOfGroups !== undefined && { numberOfGroups: dto.numberOfGroups }),
        ...(dto.format === TournamentFormat.league_and_knockout && { numberOfGroups: 1 }),
        ...(dto.format === TournamentFormat.knockout_only && { numberOfGroups: null }),
        ...(competitionRules && {
          competitionRules: competitionRules as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.rules !== undefined && { rules: dto.rules }),
        ...(dto.rulesFileUrl !== undefined && { rulesFileUrl: dto.rulesFileUrl }),
        ...(dto.flyerUrl !== undefined && { flyerUrl: dto.flyerUrl }),
      },
      include: getTournamentInclude(),
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId: id },
    });

    return updated;
  }

  async findAll(status?: TournamentStatus) {
    return this.prisma.tournament.findMany({
      where: status ? { status } : undefined,
      include: {
        teams: { select: { id: true, paid: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: getTournamentInclude(),
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    return tournament;
  }

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  async openRegistration(id: string, actorId: string) {
    const t = await this.findOneOrThrow(id);
    if (t.status !== TournamentStatus.draft) {
      throw new BadRequestException('El torneo debe estar en borrador para abrir inscripciones');
    }
    return this.changeStatus(id, TournamentStatus.registration_open, actorId);
  }

  async startTournament(id: string, actorId: string) {
    const t = await this.findOneOrThrow(id);
    if (t.status !== TournamentStatus.registration_open) {
      throw new BadRequestException('El torneo debe tener inscripciones abiertas para iniciarse');
    }
    if (t.teams.length < t.maxTeams) {
      throw new BadRequestException(
        `El torneo necesita ${t.maxTeams} equipos para iniciarse (actualmente ${t.teams.length})`,
      );
    }
    return this.changeStatus(id, TournamentStatus.in_progress, actorId);
  }

  async completeTournament(id: string, actorId: string) {
    await this.findOneOrThrow(id);
    return this.changeStatus(id, TournamentStatus.completed, actorId);
  }

  async cancelTournament(id: string, actorId: string) {
    await this.findOneOrThrow(id);
    return this.changeStatus(id, TournamentStatus.cancelled, actorId);
  }

  // ---------------------------------------------------------------------------
  // Team management
  // ---------------------------------------------------------------------------

  async registerTeam(tournamentId: string, dto: RegisterTeamDto, actorId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { teams: { select: { id: true } } },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');

    if (tournament.status !== TournamentStatus.registration_open) {
      throw new BadRequestException('Las inscripciones no están abiertas');
    }

    if (tournament.teams.length >= tournament.maxTeams) {
      throw new BadRequestException('El torneo ya está lleno');
    }

    const playerCount = (dto.players ?? []).length;
    // Only enforce minimum if at least one player was provided
    if (playerCount > 0 && playerCount < tournament.minPlayersPerTeam) {
      throw new BadRequestException(
        `El equipo debe tener al menos ${tournament.minPlayersPerTeam} jugadores`,
      );
    }
    if (playerCount > tournament.maxPlayersPerTeam) {
      throw new BadRequestException(
        `El equipo no puede tener más de ${tournament.maxPlayersPerTeam} jugadores`,
      );
    }

    // Validate member/guest constraints
    const players = dto.players ?? [];
    const memberIds = players.filter((p) => p.userId).map((p) => p.userId!);
    const guestCount = players.filter((p) => !p.userId).length;

    if (!tournament.allowExternalTeams && guestCount > 0) {
      throw new BadRequestException('Este torneo no permite jugadores externos');
    }
    if (memberIds.length < tournament.minZetasMembers) {
      throw new BadRequestException(
        `El equipo debe incluir al menos ${tournament.minZetasMembers} miembros de Zetas`,
      );
    }

    // Validate member IDs exist
    if (memberIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true },
      });
      if (users.length !== memberIds.length) {
        throw new BadRequestException('Uno o más usuarios no existen');
      }
    }

    // Validate no Zetas member belongs to another team in this tournament
    if (memberIds.length > 0) {
      const alreadyRegistered = await this.prisma.tournamentPlayer.findFirst({
        where: {
          userId: { in: memberIds },
          team: { tournamentId },
        },
        include: { user: { select: { name: true } } },
      });
      if (alreadyRegistered) {
        const name = alreadyRegistered.user?.name ?? 'Un miembro';
        throw new BadRequestException(
          `${name} ya pertenece a otro equipo en este torneo`,
        );
      }
    }

    // Validate each player has userId XOR guestName
    for (const p of players) {
      if (!p.userId && !p.guestName) {
        throw new BadRequestException('Cada jugador debe tener userId o guestName');
      }
      if (p.userId && p.guestName) {
        throw new BadRequestException('Un jugador no puede tener userId y guestName a la vez');
      }
    }

    const team = await this.prisma.tournamentTeam.create({
      data: {
        tournamentId,
        name: dto.name,
        registeredById: actorId,
        players: {
          create: players.map((p) => ({
            userId: p.userId,
            guestName: p.guestName,
            isCaptain: p.isCaptain ?? false,
          })),
        },
      },
      include: {
        players: { include: { user: { select: { id: true, name: true } } } },
        registeredBy: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_team_registered,
      details: { tournamentId, teamId: team.id, teamName: team.name },
    });

    return team;
  }

  async removeTeam(tournamentId: string, teamId: string, actorId: string) {
    await this.findOneOrThrow(tournamentId);

    const team = await this.prisma.tournamentTeam.findFirst({
      where: { id: teamId, tournamentId },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado en este torneo');

    await this.prisma.tournamentTeam.delete({ where: { id: teamId } });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_team_removed,
      details: { tournamentId, teamId, teamName: team.name },
    });
  }

  async updateTeamPayment(teamId: string, dto: UpdateTeamPaymentDto, actorId: string) {
    const team = await this.prisma.tournamentTeam.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Equipo no encontrado');

    const updated = await this.prisma.tournamentTeam.update({
      where: { id: teamId },
      data: { paid: dto.paid },
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { teamId, paid: dto.paid },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Match score
  // ---------------------------------------------------------------------------

  async updateMatchScore(matchId: string, dto: UpdateMatchDto, actorId: string) {
    const match = await this.prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: {
        sets: true,
        tournament: { select: { competitionRules: true } },
      },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');
    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('El partido no tiene equipos asignados aún');
    }

    const orderedSets = [...dto.sets].sort((a, b) => a.setNumber - b.setNumber);
    let winnerId: string;
    try {
      const rules = parseCompetitionRules(match.tournament.competitionRules);
      winnerId = evaluateMatchResult(
        match.teamAId,
        match.teamBId,
        orderedSets,
        match.phase === 'group' ? 'group' : 'knockout',
        rules,
      ).winnerId;
    } catch (error) {
      if (error instanceof MatchResultValidationError || error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentSet.deleteMany({
        where: {
          matchId,
          setNumber: { notIn: orderedSets.map((set) => set.setNumber) },
        },
      });
      for (const setData of orderedSets) {
        await tx.tournamentSet.upsert({
          where: { matchId_setNumber: { matchId, setNumber: setData.setNumber } },
          create: {
            matchId,
            setNumber: setData.setNumber,
            scoreA: setData.scoreA,
            scoreB: setData.scoreB,
          },
          update: { scoreA: setData.scoreA, scoreB: setData.scoreB },
        });
      }

      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.completed,
          winnerId,
        },
      });
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_match_updated,
      details: { matchId, sets: dto.sets },
    });

    if (match.phase !== 'group') {
      await this.advanceWinners(match.tournamentId, actorId);
    }

    return this.prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        winner: { select: { id: true, name: true } },
        sets: { orderBy: { setNumber: 'asc' } },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Standings
  // ---------------------------------------------------------------------------

  async getGroupStandings(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: { select: { id: true, name: true, groupLabel: true } },
        matches: {
          where: { phase: 'group', status: MatchStatus.completed },
          include: { sets: true },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    const rules = this.readCompetitionRules(tournament.competitionRules);

    const teamsWithGroup = tournament.teams
      .filter((team) => team.groupLabel || tournament.format === TournamentFormat.league_and_knockout)
      .map((team) => ({ id: team.id, groupLabel: team.groupLabel ?? 'A' }));

    const results = tournament.matches.map((m) => ({
      teamAId: m.teamAId!,
      teamBId: m.teamBId!,
      sets: m.sets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB })),
    }));

    return calculateStandings(teamsWithGroup, results, rules);
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  /**
   * Assign teams to groups.
   * If `assignments` provided, it's a map of teamId → groupLabel (e.g. "A", "B").
   * If omitted, teams are distributed round-robin across numberOfGroups groups.
   */
  async assignGroups(
    tournamentId: string,
    actorId: string,
    assignments?: Record<string, string>,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { teams: { select: { id: true } } },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    if (
      tournament.format !== TournamentFormat.groups_and_knockout &&
      tournament.format !== TournamentFormat.league_and_knockout
    ) {
      throw new BadRequestException('Este torneo no tiene fase de grupos');
    }
    if (!tournament.numberOfGroups) {
      throw new BadRequestException('Define el número de grupos antes de asignar');
    }

    const groups = 'ABCDEFGH'.slice(0, tournament.numberOfGroups).split('');

    if (assignments) {
      const teamIds = new Set(tournament.teams.map((team) => team.id));
      const invalidAssignment = Object.entries(assignments).some(
        ([teamId, label]) =>
          !teamIds.has(teamId) || !groups.includes(label.trim().toUpperCase()),
      );
      if (invalidAssignment) {
        throw new BadRequestException(
          'Las asignaciones contienen equipos o etiquetas de grupo inválidos',
        );
      }
      await this.prisma.$transaction(
        Object.entries(assignments).map(([teamId, label]) =>
          this.prisma.tournamentTeam.update({
            where: { id: teamId },
            data: { groupLabel: label.toUpperCase() },
          }),
        ),
      );
    } else {
      // Auto: round-robin distribution
      await this.prisma.$transaction(
        tournament.teams.map((team, idx) =>
          this.prisma.tournamentTeam.update({
            where: { id: team.id },
            data: { groupLabel: groups[idx % groups.length] },
          }),
        ),
      );
    }

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId, action: 'assign_groups' },
    });

    return this.findOne(tournamentId);
  }

  /**
   * Generate round-robin matches for each group.
   * Clears existing group-phase matches first.
   */
  async generateGroupMatches(tournamentId: string, actorId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { teams: { select: { id: true, groupLabel: true } } },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    if (
      tournament.format !== TournamentFormat.groups_and_knockout &&
      tournament.format !== TournamentFormat.league_and_knockout
    ) {
      throw new BadRequestException('Este torneo no tiene fase de grupos');
    }

    if (tournament.format === TournamentFormat.league_and_knockout) {
      await this.prisma.tournamentTeam.updateMany({
        where: { tournamentId },
        data: { groupLabel: 'A' },
      });
      tournament.teams.forEach((team) => {
        team.groupLabel = 'A';
      });
    }
    const teamsWithGroup = tournament.teams.filter((t) => t.groupLabel);
    if (teamsWithGroup.length === 0) {
      throw new BadRequestException('Asigna los equipos a grupos primero');
    }

    // Group teams by label
    const byGroup = new Map<string, string[]>();
    for (const t of teamsWithGroup) {
      const g = t.groupLabel!;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(t.id);
    }

    const deleteExistingMatches = this.prisma.tournamentMatch.deleteMany({
      where: { tournamentId, phase: 'group' },
    });

    // Create new group matches
    let matchOrder = 0;
    const creates: ReturnType<typeof this.prisma.tournamentMatch.create>[] = [];

    for (const [groupLabel, teamIds] of byGroup.entries()) {
      const pairs = generateRoundRobinPairs(teamIds);
      for (const pair of pairs) {
        creates.push(
          this.prisma.tournamentMatch.create({
            data: {
              tournamentId,
              phase: 'group',
              groupLabel,
              roundNumber: 1,
              matchOrder: matchOrder++,
              teamAId: pair.teamAId,
              teamBId: pair.teamBId,
              status: 'scheduled',
            },
          }),
        );
      }
    }

    await this.prisma.$transaction([deleteExistingMatches, ...creates]);

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId, action: 'generate_group_matches' },
    });

    return this.findOne(tournamentId);
  }

  // ---------------------------------------------------------------------------
  // Knockout bracket
  // ---------------------------------------------------------------------------

  async getBracketPreview(tournamentId: string, seeding?: string[]) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: {
          select: { id: true, name: true, groupLabel: true },
          orderBy: { createdAt: 'asc' },
        },
        matches: { where: { phase: 'group' }, include: { sets: true } },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    const rules = this.readCompetitionRules(tournament.competitionRules);

    let teamIds: string[];
    let standings: ReturnType<typeof calculateStandings> | undefined;
    if (seeding && seeding.length > 0) {
      teamIds = seeding;
    } else if (tournament.format !== TournamentFormat.knockout_only) {
      if (
        tournament.matches.length === 0 ||
        tournament.matches.some((match) => match.status !== MatchStatus.completed)
      ) {
        throw new BadRequestException(
          'Todos los partidos de la fase de grupos deben estar completos',
        );
      }
      const teamsWithGroup = tournament.teams
        .filter((team) => team.groupLabel)
        .map((team) => ({ id: team.id, groupLabel: team.groupLabel! }));
      const results = tournament.matches.map((m) => ({
        teamAId: m.teamAId!,
        teamBId: m.teamBId!,
        sets: m.sets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB })),
      }));
      standings = calculateStandings(teamsWithGroup, results, rules);
      teamIds = standings
        .filter((standing) => standing.qualified)
        .sort(
          (a, b) =>
            a.position - b.position ||
            b.points - a.points ||
            a.groupLabel.localeCompare(b.groupLabel),
        )
        .map((standing) => standing.teamId);
    } else {
      teamIds = tournament.teams.map((team) => team.id);
    }

    if (
      teamIds.length < 2 ||
      new Set(teamIds).size !== teamIds.length ||
      teamIds.some((teamId) => !tournament.teams.some((team) => team.id === teamId))
    ) {
      throw new BadRequestException(
        'La siembra debe incluir al menos dos equipos válidos y sin duplicados',
      );
    }
    const previewRules =
      seeding && seeding.length > 0
        ? {
            ...rules,
            knockoutStage: { ...rules.knockoutStage, pairingStrategy: 'high_low' as const },
          }
        : rules;
    return buildBracketPreview(teamIds, previewRules, standings);
  }

  async generateKnockoutBracket(
    tournamentId: string,
    actorId: string,
    seeding?: string[],
  ) {
    const preview = await this.getBracketPreview(tournamentId, seeding);

    const seedUpdates = preview.seeding.map((teamId, index) =>
      this.prisma.tournamentTeam.update({
        where: { id: teamId },
        data: { seed: index + 1 },
      }),
    );
    const creates: ReturnType<typeof this.prisma.tournamentMatch.create>[] = [];
    let matchOrder = 0;
    const bracketSize = preview.firstRound.length * 2;
    const hasAutomaticBye = preview.firstRound.some(
      (pair) => Boolean(pair.teamAId) !== Boolean(pair.teamBId),
    );
    for (let round = 1; round <= preview.totalRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      if (round === 1) {
        for (const pair of preview.firstRound) {
          const automaticWinnerId =
            pair.teamAId && !pair.teamBId
              ? pair.teamAId
              : pair.teamBId && !pair.teamAId
                ? pair.teamBId
                : null;
          creates.push(
            this.prisma.tournamentMatch.create({
              data: {
                tournamentId,
                phase: this.bracketPhase(matchesInRound, round, preview.totalRounds),
                roundNumber: round,
                matchOrder: matchOrder++,
                teamAId: pair.teamAId,
                teamBId: pair.teamBId,
                winnerId: automaticWinnerId,
                status: automaticWinnerId
                  ? MatchStatus.completed
                  : MatchStatus.scheduled,
              },
            }),
          );
        }
      } else {
        for (let i = 0; i < matchesInRound; i++) {
          creates.push(
            this.prisma.tournamentMatch.create({
              data: {
                tournamentId,
                phase: this.bracketPhase(matchesInRound, round, preview.totalRounds),
                roundNumber: round,
                matchOrder: matchOrder++,
                teamAId: null,
                teamBId: null,
                status: 'scheduled',
              },
            }),
          );
        }
        if (
          matchesInRound === 1 &&
          preview.totalRounds >= 2 &&
          preview.includeThirdPlace
        ) {
          creates.push(
            this.prisma.tournamentMatch.create({
              data: {
                tournamentId,
                phase: 'third_place',
                roundNumber: round,
                matchOrder: matchOrder++,
                teamAId: null,
                teamBId: null,
                status: 'scheduled',
              },
            }),
          );
        }
      }
    }

    await this.prisma.$transaction([
      this.prisma.tournamentMatch.deleteMany({
        where: { tournamentId, phase: { not: 'group' } },
      }),
      this.prisma.tournamentTeam.updateMany({
        where: { tournamentId },
        data: { seed: null },
      }),
      ...seedUpdates,
      ...creates,
    ]);

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId, action: 'generate_bracket' },
    });

    if (hasAutomaticBye) {
      return this.advanceWinners(tournamentId, actorId);
    }
    return this.findOne(tournamentId);
  }

  /**
   * Advance winners: for each completed match, find the next-round match slot
   * and fill in the winner. Also fills 3rd-place match with the losers of semis.
   */
  async advanceWinners(tournamentId: string, actorId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        matches: {
          where: { phase: { not: 'group' } },
          orderBy: [{ roundNumber: 'asc' }, { matchOrder: 'asc' }],
        },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');

    const allMatches = tournament.matches;

    // Group by round
    const byRound = new Map<number, typeof allMatches>();
    for (const m of allMatches) {
      if (m.phase === 'third_place') continue;
      if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, []);
      byRound.get(m.roundNumber)!.push(m);
    }

    const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
    const updates: ReturnType<typeof this.prisma.tournamentMatch.update>[] = [];

    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const currentRound = byRound.get(rounds[ri])!;
      const nextRound = byRound.get(rounds[ri + 1])!;

      // Pair current matches to next-round slots: matches 0&1 → slot 0, matches 2&3 → slot 1, etc.
      for (let i = 0; i < nextRound.length; i++) {
        const matchA = currentRound[i * 2];
        const matchB = currentRound[i * 2 + 1];

        if (matchA?.winnerId && matchB?.winnerId) {
          updates.push(
            this.prisma.tournamentMatch.update({
              where: { id: nextRound[i].id },
              data: { teamAId: matchA.winnerId, teamBId: matchB.winnerId },
            }),
          );
        } else if (matchA?.winnerId) {
          updates.push(
            this.prisma.tournamentMatch.update({
              where: { id: nextRound[i].id },
              data: { teamAId: matchA.winnerId },
            }),
          );
        }
      }

      // 3rd place: losers from the semifinal round (last non-final round before final)
      const semiRound = rounds[rounds.length - 2];
      if (rounds[ri] === semiRound) {
        const semiMatches = byRound.get(semiRound)!;
        const thirdPlace = allMatches.find((m) => m.phase === 'third_place');
        if (thirdPlace && semiMatches.length === 2) {
          const loserA = semiMatches[0].winnerId
            ? semiMatches[0].teamAId === semiMatches[0].winnerId
              ? semiMatches[0].teamBId
              : semiMatches[0].teamAId
            : null;
          const loserB = semiMatches[1].winnerId
            ? semiMatches[1].teamAId === semiMatches[1].winnerId
              ? semiMatches[1].teamBId
              : semiMatches[1].teamAId
            : null;

          if (loserA || loserB) {
            updates.push(
              this.prisma.tournamentMatch.update({
                where: { id: thirdPlace.id },
                data: {
                  ...(loserA && { teamAId: loserA }),
                  ...(loserB && { teamBId: loserB }),
                },
              }),
            );
          }
        }
      }
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId, action: 'advance_winners' },
    });

    return this.findOne(tournamentId);
  }

  // ---------------------------------------------------------------------------
  // Cancel a match
  // ---------------------------------------------------------------------------

  async cancelMatch(matchId: string, actorId: string) {
    const match = await this.prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partido no encontrado');
    if ((match.status as string) === 'completed') {
      throw new BadRequestException('No se puede cancelar un partido ya completado');
    }

    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'cancelled' as MatchStatus, winnerId: null },
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_match_updated,
      details: { matchId, action: 'cancel' },
    });

    return this.prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        sets: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // File uploads
  // ---------------------------------------------------------------------------

  async updateRulesFile(id: string, url: string, actorId: string) {
    await this.findOneOrThrow(id);
    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { rulesFileUrl: url },
      include: getTournamentInclude(),
    });
    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId: id, action: 'upload_rules_pdf' },
    });
    return updated;
  }

  async updateFlyer(id: string, url: string, actorId: string) {
    await this.findOneOrThrow(id);
    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { flyerUrl: url },
      include: getTournamentInclude(),
    });
    await this.audit.log({
      actorId,
      action: AuditAction.tournament_updated,
      details: { tournamentId: id, action: 'upload_flyer' },
    });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private bracketPhase(matchesInRound: number, round: number, _totalRounds: number): string {
    if (matchesInRound === 1) return 'final';
    if (matchesInRound === 2) return 'semifinal';
    if (matchesInRound === 4) return 'quarterfinal';
    return `round_${round}`;
  }

  private readCompetitionRules(value: Prisma.JsonValue): CompetitionRulesV1 {
    try {
      return parseCompetitionRules(value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'La configuración de competencia no es válida';
      throw new BadRequestException(message);
    }
  }

  private async findOneOrThrow(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: { teams: { select: { id: true } } },
    });
    if (!t) throw new NotFoundException('Torneo no encontrado');
    return t;
  }

  private async changeStatus(id: string, status: TournamentStatus, actorId: string) {
    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status },
      include: getTournamentInclude(),
    });

    await this.audit.log({
      actorId,
      action: AuditAction.tournament_status_changed,
      details: { tournamentId: id, status },
    });

    return updated;
  }
}
