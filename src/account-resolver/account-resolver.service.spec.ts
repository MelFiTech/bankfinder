import { Test, TestingModule } from '@nestjs/testing';
import { AccountResolverService } from './account-resolver.service';

describe('AccountResolverService', () => {
  let service: AccountResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountResolverService],
    }).compile();

    service = module.get<AccountResolverService>(AccountResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
