import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Deliberately identical for unknown users and wrong passwords so the endpoint
 * cannot be used to enumerate accounts.
 */
export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Credenciales inválidas');
  }
}

export class AccountSuspendedException extends ForbiddenException {
  constructor(reason?: string | null) {
    super(`Tu cuenta ha sido suspendida${reason ? ': ' + reason : ''}`);
  }
}

export class AccountInactiveException extends ForbiddenException {
  constructor() {
    super('Tu cuenta está inactiva. Contacta a un administrador.');
  }
}

export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super('Token inválido');
  }
}

export class ExpiredTokenException extends UnauthorizedException {
  constructor() {
    super('Token inválido o expirado');
  }
}

export class WrongCurrentPasswordException extends UnauthorizedException {
  constructor() {
    super('Contraseña actual incorrecta');
  }
}

export class InactiveOrUnknownUserException extends UnauthorizedException {
  constructor() {
    super('Usuario inactivo o no encontrado');
  }
}
