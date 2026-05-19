import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '15m' },
    }),
    forwardRef(() => WhatsappModule),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
