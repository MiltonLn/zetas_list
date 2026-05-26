import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, TransactionType, FineStatus } from '@prisma/client';
import { FinancesService } from './finances.service';
import { CreateTransactionDto, UpdateTransactionDto, CreateFineDto, UpdateFineDto, ImportFinancesDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';

@ApiTags('finances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finances')
export class FinancesController {
  constructor(private financesService: FinancesService) {}

  // ─── READ (all authenticated users) ────────────────────────────────────────

  @Get('dashboard')
  @ApiQuery({ name: 'year', required: false })
  getDashboard(@Query('year') year?: string) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.financesService.getDashboard(y);
  }

  @Get('transactions')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  getTransactions(@Query('year') year?: string, @Query('type') type?: TransactionType) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.financesService.getTransactions(y, type);
  }

  @Get('fines')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'status', enum: FineStatus, required: false })
  getFines(@Query('year') year?: string, @Query('status') status?: FineStatus) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.financesService.getFines(y, status);
  }

  @Get('my-fines')
  getMyFines(@CurrentUser() user: JwtUser) {
    return this.financesService.getUserPendingFines(user.id);
  }

  // ─── TRANSACTIONS ADMIN ────────────────────────────────────────────────────

  @Roles(Role.admin)
  @Post('transactions')
  createTransaction(@Body() dto: CreateTransactionDto, @CurrentUser() user: JwtUser) {
    return this.financesService.createTransaction(dto, user.id);
  }

  @Roles(Role.admin)
  @Patch('transactions/:id')
  updateTransaction(@Param('id') id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: JwtUser) {
    return this.financesService.updateTransaction(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Delete('transactions/:id')
  deleteTransaction(@Param('id') id: string) {
    return this.financesService.deleteTransaction(id);
  }

  // ─── FINES ADMIN ───────────────────────────────────────────────────────────

  @Roles(Role.admin)
  @Post('fines')
  createFine(@Body() dto: CreateFineDto, @CurrentUser() user: JwtUser) {
    return this.financesService.createFine(dto, user.id);
  }

  @Roles(Role.admin)
  @Patch('fines/:id')
  updateFine(@Param('id') id: string, @Body() dto: UpdateFineDto, @CurrentUser() user: JwtUser) {
    return this.financesService.updateFine(id, dto, user.id);
  }

  @Roles(Role.admin)
  @Delete('fines/:id')
  deleteFine(@Param('id') id: string) {
    return this.financesService.deleteFine(id);
  }

  // ─── IMPORT ────────────────────────────────────────────────────────────────

  @Roles(Role.admin)
  @Post('import')
  importData(@Body() dto: ImportFinancesDto, @CurrentUser() user: JwtUser) {
    return this.financesService.importData(dto, user.id);
  }
}
