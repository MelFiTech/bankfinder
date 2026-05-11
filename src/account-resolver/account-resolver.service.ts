import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SmeplugService, type SmeplugBank } from '../smeplug/smeplug.service';
import { PrismaService } from '../prisma/prisma.service';

type ResolveCandidate = {
  code: string;
  label: string;      // display name
  isPriority: boolean;
};

export type ResolveBankAndAccountResult = {
  bankCode: string;
  bankName: string;
  accountName: string;
};

// CBN-assigned 3-digit NUBAN sort code prefixes for commercial and PSB banks.
// When the prefix matches we put that bank first in the concurrent fan-out so it
// tends to respond first — but ALL banks fire simultaneously regardless.
//
// MFBs (Kuda, Moniepoint, PalmPay, etc.) use 6-digit CBN codes that don't map
// cleanly to a 3-digit NUBAN prefix, so they aren't listed here. They sit at the
// top of the priority queue and are included in every concurrent fan-out anyway.
const NUBAN_PREFIX_MAP: Record<string, string> = {
  '044': 'Access Bank Plc',
  '063': 'Access Bank Plc',            // legacy Diamond Bank sort code
  '023': 'Citibank Nigeria Limited',
  '050': 'Ecobank Nigeria Plc',
  '084': 'Ecobank Nigeria Plc',
  '070': 'Fidelity Bank Plc',
  '011': 'First Bank Nigeria Limited',
  '085': 'First Bank Nigeria Limited',
  '214': 'First City Monument Bank Plc',
  '058': 'Guaranty Trust Bank Plc',
  '030': 'Heritage Banking Company Ltd.',
  '082': 'Keystone Bank Limited',
  '076': 'Polaris Bank Plc',
  '101': 'ProvidusBank PLC',
  '221': 'Stanbic IBTC Bank Plc',
  '068': 'Standard Chartered Bank Nigeria Ltd.',
  '232': 'Sterling Bank Plc',
  '100': 'Suntrust Bank',
  '032': 'Union Bank of Nigeria Plc',
  '033': 'United Bank For Africa Plc',
  '215': 'Unity Bank Plc',
  '035': 'Wema Bank Plc',
  '057': 'Zenith Bank Plc',
  '301': 'Jaiz Bank',
  '303': 'Lotus Bank',
  '102': 'Titan Trust Bank',
  '107': 'Globus Bank',
  '120': 'Optimus Bank',
  '105': 'Parallex Bank Ltd',
  '327': '9 Payment Service Bank',     // Opay's PSB licence
};

// Banks most likely to hold an account — tried first in the concurrent fan-out.
// Order matters only as a tiebreaker when multiple banks respond in the same tick.
const PRIORITY_BANK_NAMES: readonly string[] = [
  'Opay',
  'Kuda',
  'Moniepoint',
  'PALMPAY',
  'Access Bank Plc',
  'Zenith Bank Plc',
  'Guaranty Trust Bank Plc',
  'First Bank Nigeria Limited',
  'United Bank For Africa Plc',
  'Fidelity Bank Plc',
  'Union Bank of Nigeria Plc',
  'Sterling Bank Plc',
  'Wema Bank Plc',
  'Stanbic IBTC Bank Plc',
  'First City Monument Bank Plc',
  'Ecobank Nigeria Plc',
  'Polaris Bank Plc',
  'Keystone Bank Limited',
  'Heritage Banking Company Ltd.',
  'Unity Bank Plc',
  'Citibank Nigeria Limited',
  'Standard Chartered Bank Nigeria Ltd.',
  'Stanbic IBTC Bank Plc',
  'Jaiz Bank',
  'Lotus Bank',
  'Titan Trust Bank',
  'Globus Bank',
  'Optimus Bank',
  'Parallex Bank Ltd',
  'PremiumTrust Bank',
  'ProvidusBank PLC',
  'Nova Merchant Bank',
  'Suntrust Bank',
  '9 Payment Service Bank',
  'Momo Psb',
  'Smartcash Payment Service Bank',
  'Hopepsb',
  'VFD Micro Finance Bank',
  'Sparkle',
  'Tangerine Bank',
  'Carbon',
  'Fairmoney Microfinance Bank Ltd',
  'Moniepoint Microfinance Bank',
  'Eyowo MFB',
  'Accion Microfinance Bank',
  'Baobab Microfinance Bank',
  'NIRSAL Microfinance Bank',
  'AB Microfinance Bank',
  'Paga',
  'Rand merchant Bank',
  'SIGNATURE BANK',
  'ALTERNATIVE BANK LIMITED',
  'ASOSavings & Loans',
  'IBANK Microfinance Bank',
  'New Dawn Microfinance Bank',
  'UNN MFB',
  'LOMA Microfinance Bank',
  'Central Bank Of Nigeria',
  'ENaira',
];

const BANKS_CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes
const RESOLVE_TIMEOUT_MS  = 8_000;           // per individual call

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

@Injectable()
export class AccountResolverService implements OnModuleInit {
  private readonly logger = new Logger(AccountResolverService.name);

  // All banks from SME Plug, ordered: priority-matched first, then the rest.
  private candidates: ResolveCandidate[] = [];
  private lastSyncedAt = 0;

  private readonly resultCache = new Map<
    string,
    { result: ResolveBankAndAccountResult; expiresAt: number }
  >();

  constructor(
    private readonly smeplug: SmeplugService,
    private readonly prismaService: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.syncCandidates(true);
    } catch (err) {
      this.logger.error(`Initial bank sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async resolveBankAndAccount(
    accountNumber: string,
  ): Promise<ResolveBankAndAccountResult | null> {
    const acct = accountNumber?.trim() ?? '';
    if (!acct) return null;

    // 1. In-memory cache (fastest)
    const cached = this.resultCache.get(acct);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.log(`Memory cache hit: ${acct}`);
      return cached.result;
    }

    // 2. Persistent DB lookup (fast, survives restarts)
    try {
      const stored = await this.prismaService.db.resolvedAccount.findUnique({
        where: { accountNumber: acct },
      });
      if (stored) {
        const result: ResolveBankAndAccountResult = {
          bankCode: stored.bankCode,
          bankName: stored.bankName,
          accountName: stored.accountName,
        };
        this.resultCache.set(acct, { result, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
        this.logger.log(`DB hit: ${acct}`);
        return result;
      }
    } catch (err) {
      this.logger.warn(`DB lookup failed for ${acct}: ${err instanceof Error ? err.message : err}`);
    }

    // 3. Live resolution via SME Plug
    await this.syncCandidates(false);
    if (this.candidates.length === 0) return null;

    const prefix = acct.slice(0, 3);
    const knownBank = NUBAN_PREFIX_MAP[prefix];

    // If the NUBAN prefix identifies the bank definitively, try ONLY that bank.
    // Firing a concurrent fan-out here would risk a false positive: fintechs like
    // Opay sometimes return a name for any account number, so if Opay wins the race
    // against Polaris on a 076xxxxxxx account, we'd return the wrong bank entirely.
    const candidates = knownBank
      ? this.candidates.filter(c => c.label === knownBank)
      : this.candidates;

    // For unknown prefixes (digital bank accounts), put digital-first banks at the
    // front so the most likely owner wins the race — but all still fire concurrently.
    const ordered = knownBank
      ? candidates
      : [
          ...this.candidates.filter(c => c.isPriority),
          ...this.candidates.filter(c => !c.isPriority),
        ];

    try {
      const result = await Promise.any(
        ordered.map(candidate => this.attempt(candidate, acct)),
      );

      // Persist so future lookups skip the API entirely
      this.prismaService.db.resolvedAccount.upsert({
        where: { accountNumber: acct },
        create: {
          accountNumber: acct,
          accountName: result.accountName,
          bankCode: result.bankCode,
          bankName: result.bankName,
        },
        update: {
          accountName: result.accountName,
          bankCode: result.bankCode,
          bankName: result.bankName,
        },
      }).catch(err =>
        this.logger.warn(`DB persist failed: ${err instanceof Error ? err.message : err}`),
      );

      this.resultCache.set(acct, { result, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
      this.logger.log(`Live resolved ${acct} → ${result.bankName}`);
      return result;
    } catch {
      this.logger.warn(`No bank resolved for ${acct}`);
      return null;
    }
  }

  getBanks(): { code: string; name: string }[] {
    return this.candidates.map(c => ({ code: c.code, name: c.label }));
  }

  async lookupAccountName(
    bankCode: string,
    accountNumber: string,
  ): Promise<{ accountName: string; bankName: string }> {
    const res = await this.smeplug.resolveAccount(bankCode.trim(), accountNumber.trim());
    if (!res.ok || !res.accountName) {
      throw new Error(res.message ?? 'Unable to resolve account name');
    }
    return { accountName: res.accountName, bankName: res.bankName ?? 'Unknown Bank' };
  }

  // Wraps a single resolveAccount call; throws on miss so Promise.any can skip it.
  private async attempt(
    candidate: ResolveCandidate,
    accountNumber: string,
  ): Promise<ResolveBankAndAccountResult> {
    const res = await this.smeplug.resolveAccount(candidate.code, accountNumber);
    if (res.ok && res.accountName?.trim()) {
      return {
        bankCode: candidate.code,
        bankName: res.bankName?.trim() || candidate.label,
        accountName: res.accountName.trim(),
      };
    }
    throw new Error('no match');
  }

  // Build an ordered candidate list from SME Plug's full bank list.
  // Priority banks come first (preserving PRIORITY_BANK_NAMES order);
  // every other bank SME Plug knows about follows so nothing is ever missed.
  private async syncCandidates(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && this.lastSyncedAt > 0 && now - this.lastSyncedAt < BANKS_CACHE_TTL_MS) return;

    const providerBanks = await this.smeplug.fetchBanks();
    this.lastSyncedAt = now;

    if (providerBanks.length === 0) {
      this.logger.warn('SME Plug returned empty bank list');
      return;
    }

    const byNorm = new Map<string, SmeplugBank>();
    for (const b of providerBanks) byNorm.set(normalizeName(b.name), b);

    const usedCodes = new Set<string>();
    const priority: ResolveCandidate[] = [];

    for (const name of PRIORITY_BANK_NAMES) {
      const bank = this.matchBank(name, providerBanks);
      if (bank && !usedCodes.has(bank.code)) {
        usedCodes.add(bank.code);
        priority.push({ code: bank.code, label: bank.name, isPriority: true });
      } else if (!bank) {
        this.logger.warn(`No SME Plug match for priority bank "${name}"`);
      }
    }

    // Append every remaining SME Plug bank not already in priority list.
    // This guarantees we never miss an account just because its bank wasn't named above.
    const rest: ResolveCandidate[] = providerBanks
      .filter(b => !usedCodes.has(b.code))
      .map(b => ({ code: b.code, label: b.name, isPriority: false }));

    this.candidates = [...priority, ...rest];
    this.logger.log(
      `Candidates synced: ${priority.length} priority + ${rest.length} additional = ${this.candidates.length} total`,
    );
  }

  private matchBank(name: string, banks: SmeplugBank[]): SmeplugBank | null {
    const target = normalizeName(name);
    let best: SmeplugBank | null = null;
    let bestScore = 0;

    for (const b of banks) {
      const n = normalizeName(b.name);
      let score = 0;
      if (n === target)                          score = 100;
      else if (n.includes(target) || target.includes(n)) score = 82;
      else {
        const tw = target.split(' ').filter(w => w.length > 2);
        const nw = n.split(' ').filter(w => w.length > 2);
        if (tw.length && nw.length) {
          const hits = tw.filter(w => nw.some(x => x.includes(w) || w.includes(x))).length;
          const ratio = hits / Math.max(tw.length, 1);
          if (ratio >= 0.5) score = 55 + Math.floor(20 * ratio);
        }
      }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best && bestScore >= 55 ? best : null;
  }
}
