import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CustomersService } from './customers.service';
import { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@ApiBearerAuth('access-token')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers (search + pagination)' })
  @ApiOkResponse({ description: 'Paginated customer list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.list(user, { search, page, pageSize });
  }

  @Post('check-duplicate')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary: 'Warn about look-alike customers before create (advisory only)',
  })
  checkDuplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckDuplicateCustomerDto,
  ) {
    return this.customersService.checkDuplicate(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.getById(user, id);
  }

  @Post()
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Create customer' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, dto);
  }

  @Patch(':id')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Soft-delete customer' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.customersService.softDelete(user, id);
  }
}
