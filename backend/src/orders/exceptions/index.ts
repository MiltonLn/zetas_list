import { BadRequestException, NotFoundException } from '@nestjs/common';

export class OrderNotFoundException extends NotFoundException {
  constructor() {
    super('Pedido no encontrado');
  }
}

export class OrderUserNotFoundException extends NotFoundException {
  constructor() {
    super('Usuario no encontrado');
  }
}

export class ShirtNumberRequiredException extends BadRequestException {
  constructor(target: 'self' | 'other' = 'self') {
    super(
      target === 'self'
        ? 'Debes indicar tu número de camiseta'
        : 'Debes indicar el número de camiseta',
    );
  }
}

export class InvalidProductException extends BadRequestException {
  constructor(productId: string) {
    super(`Producto inválido: ${productId}`);
  }
}

export class InvalidVariantException extends BadRequestException {
  constructor(variantId: string) {
    super(`Variante inválida: ${variantId}`);
  }
}

export class SizeRequiredException extends BadRequestException {
  constructor(productName: string) {
    super(`Debes seleccionar una talla para ${productName}`);
  }
}

export class InvalidSizeException extends BadRequestException {
  constructor(productName: string) {
    super(`Talla inválida para ${productName}`);
  }
}
