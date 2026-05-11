import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '.prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

export type ExtendedPrismaClient = ReturnType<typeof buildClient>;

function buildClient(url: string) {
  return new PrismaClient({ accelerateUrl: url }).$extends(withAccelerate());
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private _base: PrismaClient;
  db: ExtendedPrismaClient;

  async onModuleInit() {
    this._base = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });
    this.db = this._base.$extends(withAccelerate()) as ExtendedPrismaClient;
  }

  async onModuleDestroy() {
    await this._base?.$disconnect();
  }
}
