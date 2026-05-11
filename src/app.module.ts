import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountResolverService } from './account-resolver/account-resolver.service';
import { AccountResolverController } from './account-resolver/account-resolver.controller';
import { SmeplugModule } from './smeplug/smeplug.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SmeplugModule,
  ],
  controllers: [AppController, AccountResolverController],
  providers: [AppService, AccountResolverService],
})
export class AppModule {
  constructor() {
    console.log('AppModule initialized');
  }
}