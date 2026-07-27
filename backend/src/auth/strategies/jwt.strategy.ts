import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUser } from '../jwt-user.interface';
import { env } from '../../config/env';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

function extractJwt(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const token = req.query?.token;
  if (typeof token === 'string' && token.length > 0) return token;
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
        phone: true,
        position: true,
        gender: true,
        photoUrl: true,
        mustChangePassword: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Usuario inactivo o no encontrado');
    }

    return user;
  }
}
