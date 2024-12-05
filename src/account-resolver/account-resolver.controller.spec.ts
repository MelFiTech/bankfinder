import { Test, TestingModule } from '@nestjs/testing';
import { AccountResolverController } from './account-resolver.controller';

describe('AccountResolverController', () => {
  let controller: AccountResolverController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountResolverController],
    }).compile();

    controller = module.get<AccountResolverController>(AccountResolverController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
