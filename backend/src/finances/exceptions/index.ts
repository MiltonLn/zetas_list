import { NotFoundException } from '@nestjs/common';

export class TransactionNotFoundException extends NotFoundException {
  constructor() {
    super('Transacción no encontrada');
  }
}

export class FineNotFoundException extends NotFoundException {
  constructor() {
    super('Multa no encontrada');
  }
}
