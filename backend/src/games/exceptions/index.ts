import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

export class AlreadyRegisteredException extends ConflictException {
  constructor(name?: string) {
    super(name ? `Ya está anotado: ${name}` : 'Ya estás anotado en este partido');
  }
}

export class NotRegisteredException extends NotFoundException {
  constructor() {
    super('Registro no encontrado');
  }
}

export class NoPendingConfirmationException extends NotFoundException {
  constructor() {
    super('No tienes una confirmación pendiente');
  }
}

export class GameNotFoundException extends NotFoundException {
  constructor() {
    super('Partido no encontrado');
  }
}

export class GameNotOpenException extends BadRequestException {
  constructor() {
    super('El registro para este partido no está abierto');
  }
}

export class GameFullException extends BadRequestException {
  constructor() {
    super('La lista principal ya está llena');
  }
}

export class InactiveUserException extends BadRequestException {
  constructor() {
    super('El usuario que intentas anotar no tiene una cuenta activa');
  }
}

export class MustBeRegisteredFirstException extends BadRequestException {
  constructor() {
    super('Debes estar anotado en la lista antes de poder anotar a otra persona');
  }
}

export class ProxyLimitExceededException extends BadRequestException {
  constructor(max: number) {
    super(`Ya anotaste el máximo de ${max} persona(s) en este partido`);
  }
}

export class NoOneInWaitListException extends NotFoundException {
  constructor() {
    super('No hay nadie en la lista de espera');
  }
}

export class CannotRemoveOtherException extends ForbiddenException {
  constructor() {
    super('No puedes eliminar a otro jugador');
  }
}

export class GameAlreadyCompletedException extends BadRequestException {
  constructor() {
    super('Este partido ya está completado');
  }
}

export class GameCancelledException extends BadRequestException {
  constructor() {
    super('No se puede completar un partido cancelado');
  }
}

export class DuplicateGameException extends ConflictException {
  constructor(date: string) {
    super(`Ya existe un partido programado para el ${date}. Solo se permite uno por día.`);
  }
}

export class UserHasUnpaidFinesException extends ForbiddenException {
  constructor() {
    super('No puedes anotarte porque tienes multas/deudas pendientes. Contacta a un admin para ponerte al día.');
  }
}

export class UnratedPlayersException extends BadRequestException {
  constructor(names: string[]) {
    super(`No se pueden generar equipos: hay jugadores sin calificación de habilidad: ${names.join(', ')}.`);
  }
}

export class NotEnoughPlayersException extends BadRequestException {
  constructor(minimum: number) {
    super(`No hay suficientes jugadores en la lista principal para formar equipos (mínimo ${minimum}).`);
  }
}

export class NotEnoughSettersException extends BadRequestException {
  constructor(needed: number, available: number) {
    super(`No hay suficientes armadores para formar los equipos: se necesitan ${needed} y hay ${available}.`);
  }
}

export class TeamsNotGeneratedException extends BadRequestException {
  constructor() {
    super('Aún no se han generado los equipos para este partido.');
  }
}
