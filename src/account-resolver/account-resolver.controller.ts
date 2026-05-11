import { Controller, Get, Post, Query, Body, Logger } from '@nestjs/common';
import { AccountResolverService } from './account-resolver.service';

@Controller('account-resolver')
export class AccountResolverController {
  private readonly logger = new Logger(AccountResolverController.name);

  constructor(private readonly accountResolverService: AccountResolverService) {}

  @Get('banks')
  getBanks() {
    return { success: true, data: this.accountResolverService.getBanks() };
  }

  @Get('resolve')
  async resolveBank(@Query('accountNumber') accountNumber: string) {
    try {
      const result = await this.accountResolverService.resolveBankAndAccount(accountNumber);

      if (!result) {
        this.logger.warn(`No bank/account match for account number ${accountNumber}`);
        return {
          success: false,
          message: 'No bank identified for this account number, or account could not be resolved.',
          data: null,
        };
      }

      return {
        success: true,
        message: 'Bank and account resolved.',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error resolving bank: ${error.message}`);
      return {
        success: false,
        message: `Error resolving bank: ${error.message}`,
        data: null,
      };
    }
  }

  @Post('lookup-account-name')
  async lookupAccountName(@Body() body: { bankCode: string; accountNumber: string }) {
    try {
      const { bankCode, accountNumber } = body;
      const result = await this.accountResolverService.lookupAccountName(bankCode, accountNumber);
      
      return {
        success: true,
        message: 'Account name lookup successful',
        data: result
      };
    } catch (error) {
      this.logger.error(`Error in account name lookup: ${error.message}`);
      return {
        success: false,
        message: `Error in account name lookup: ${error.message}`,
        data: null
      };
    }
  }
}