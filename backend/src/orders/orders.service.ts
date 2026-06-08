import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, ShirtSize } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertShirtNumberAvailable } from '../users/shirt-number.util';
import { CATALOG, getProduct, getUnitPrice, getVariant } from './catalog';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_INCLUDE = {
  items: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      gender: true,
    },
  },
};

interface LineItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  size: ShirtSize | null;
  quantity: number;
  customName: string | null;
  requiresNumber: boolean;
  unitPrice: number;
  lineTotal: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  getCatalog() {
    return CATALOG;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, gender: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const lineItems = dto.items.map((item) => this.buildLineItem(item, user.name));

    const requiresNumber = lineItems.some((li) => li.requiresNumber);
    if (requiresNumber && (dto.shirtNumber === undefined || dto.shirtNumber === null)) {
      throw new BadRequestException('Debes indicar tu número de camiseta');
    }

    const hasNumber = dto.shirtNumber !== undefined && dto.shirtNumber !== null;
    if (hasNumber) {
      await assertShirtNumberAvailable(this.prisma, {
        number: dto.shirtNumber as number,
        gender: user.gender,
        excludeUserId: user.id,
      });
    }

    const firstShirt = lineItems.find((li) => li.requiresNumber);
    const profileData: { shirtSize?: ShirtSize; shirtNumber?: number } = {};
    if (firstShirt?.size) profileData.shirtSize = firstShirt.size;
    if (hasNumber) profileData.shirtNumber = dto.shirtNumber as number;

    const totalAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          totalAmount,
          notes: dto.notes,
          items: {
            create: lineItems.map((li) => ({
              productId: li.productId,
              productName: li.productName,
              variantId: li.variantId,
              variantName: li.variantName,
              size: li.size,
              quantity: li.quantity,
              customName: li.customName,
              customNumber: li.requiresNumber ? (dto.shirtNumber as number) : null,
              unitPrice: li.unitPrice,
              lineTotal: li.lineTotal,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      if (Object.keys(profileData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: profileData });
      }

      return created;
    });

    await this.audit.log({
      actorId: userId,
      targetUserId: userId,
      action: 'order_created',
      details: {
        orderId: order.id,
        totalAmount,
        itemCount: lineItems.length,
      },
    });

    return order;
  }

  findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
      include: ORDER_INCLUDE,
    });

    await this.audit.log({
      actorId,
      targetUserId: order.userId,
      action: 'order_status_changed',
      details: { orderId: id, status: dto.status },
    });

    return updated;
  }

  private buildLineItem(item: OrderItemDto, userName: string): LineItem {
    const product = getProduct(item.productId);
    if (!product) {
      throw new BadRequestException(`Producto inválido: ${item.productId}`);
    }

    const variant = getVariant(product, item.variantId);
    if (!variant) {
      throw new BadRequestException(`Variante inválida: ${item.variantId}`);
    }

    let size: ShirtSize | null = null;
    if (product.sizes.length > 0) {
      if (!item.size) {
        throw new BadRequestException(`Debes seleccionar una talla para ${product.name}`);
      }
      if (!product.sizes.includes(item.size)) {
        throw new BadRequestException(`Talla inválida para ${product.name}`);
      }
      size = item.size;
    }

    const unitPrice = getUnitPrice(product, variant);
    const customName = product.allowsCustomName
      ? item.customName?.trim() || userName
      : null;

    return {
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      size,
      quantity: item.quantity,
      customName,
      requiresNumber: product.requiresNumber,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    };
  }
}
