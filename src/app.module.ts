import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountResolverService } from './account-resolver/account-resolver.service';
import { AccountResolverController } from './account-resolver/account-resolver.controller';

@Module({
  imports: [HttpModule],
  controllers: [AppController, AccountResolverController],
  providers: [AppService, AccountResolverService],
})
export class AppModule {
  constructor() {
    console.log('AppModule initialized');
  }
}