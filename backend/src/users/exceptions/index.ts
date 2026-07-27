import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class UserNotFoundException extends NotFoundException {
  constructor() {
    super('Usuario no encontrado');
  }
}

export class UsernameTakenException extends ConflictException {
  constructor() {
    super('El nombre de usuario ya existe');
  }
}

export class PhoneTakenException extends ConflictException {
  constructor() {
    super('El número de teléfono ya está registrado');
  }
}

export class ShirtNumberTakenException extends ConflictException {
  constructor(number: number, takenByName: string) {
    super(`El número ${number} ya está asignado a ${takenByName} en tu categoría`);
  }
}

export class CannotEditOtherProfileException extends ForbiddenException {
  constructor() {
    super('Solo puedes editar tu propio perfil');
  }
}

export class OnlyAdminCanChangeNameException extends ForbiddenException {
  constructor() {
    super('Solo un administrador puede cambiar el nombre real.');
  }
}

export class BanReasonRequiredException extends BadRequestException {
  constructor() {
    super('Se requiere una razón para banear al usuario');
  }
}

export class CannotChangeOwnRoleException extends BadRequestException {
  constructor() {
    super('No puedes cambiar tu propio rol');
  }
}
