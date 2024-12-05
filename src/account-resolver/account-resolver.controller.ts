import { Controller, Get, Post, Query, Body, Logger } from '@nestjs/common';
import { AccountResolverService } from './account-resolver.service';

@Controller('account-resolver')
export class AccountResolverController {
  private readonly logger = new Logger(AccountResolverController.name);

  constructor(private readonly accountResolverService: AccountResolverService) {}

  @Get('resolve')
  async resolveBank(@Query('accountNumber') accountNumber: string) {
    try {
      const startTime = Date.now();
      const potentialBanks = await this.accountResolverService.resolveBank(accountNumber);
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime > 2000) {
        return {
          success: false,
          message: "Bank resolution exceeded 2 seconds",
          data: []
        };
      }

      if (potentialBanks.length === 0) {
        this.logger.warn(`No banks found for account number ${accountNumber}`);
        return {
          success: false,
          message: "No banks identified for the given account number.",
          data: []
        };
      }

      return {
        success: true,
        message: `Found ${potentialBanks.length} bank(s) for the given account number`,
        data: potentialBanks
      };
    } catch (error) {
      this.logger.error(`Error resolving bank: ${error.message}`);
      return {
        success: false,
        message: `Error resolving bank: ${error.message}`,
        data: []
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