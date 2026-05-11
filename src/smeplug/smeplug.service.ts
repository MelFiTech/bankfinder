import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export type SmeplugBank = {
  code: string;
  name: string;
};

export type SmeplugResolveAccountResult = {
  ok: boolean;
  accountName?: string;
  bankName?: string;
  message?: string;
};

@Injectable()
export class SmeplugService {
  private readonly logger = new Logger(SmeplugService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl(): string {
    return this.config
      .get<string>('SMEPLUG_BASE_URL', 'https://smeplug.ng/api/v1')
      .replace(/\/$/, '');
  }

  private privateKey(): string {
    return this.config.get<string>('SMEPLUG_PRIVATE_KEY', '').trim();
  }

  private authHeaders(): Record<string, string> {
    const key = this.privateKey();
    if (!key) {
      this.logger.warn('SMEPLUG_PRIVATE_KEY is not set');
    }
    return {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    };
  }

  /**
   * GET /transfer/banks — returns provider bank codes and names for matching and resolve calls.
   */
  async fetchBanks(): Promise<SmeplugBank[]> {
    const url = `${this.baseUrl()}/transfer/banks`;
    const { data } = await firstValueFrom(
      this.http.get<{ status?: boolean; banks?: { code?: string; name?: string }[] }>(url, {
        headers: this.authHeaders(),
        timeout: 30_000,
      }),
    );

    if (!data?.banks || !Array.isArray(data.banks)) {
      this.logger.warn('SME Plug banks response missing banks array');
      return [];
    }

    return data.banks
      .map((b) => ({
        code: String(b.code ?? '').trim(),
        name: String(b.name ?? '').trim(),
      }))
      .filter((b) => b.code.length > 0);
  }

  /**
   * POST /transfer/resolveaccount — validates account for a bank_code + account_number.
   */
  async resolveAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<SmeplugResolveAccountResult> {
    const url = `${this.baseUrl()}/transfer/resolveaccount`;
    const body = {
      bank_code: bankCode.trim(),
      account_number: accountNumber.trim(),
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post<unknown>(url, body, {
          headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
          timeout: 8_000,
        }),
      );
      return this.normalizeResolveResponse(data);
    } catch (error) {
      const err = error as AxiosError<{ message?: string }>;
      const msg =
        err.response?.data && typeof err.response.data === 'object'
          ? String((err.response.data as { message?: string }).message ?? err.message)
          : err.message;
      this.logger.debug(`resolveAccount error: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  private normalizeResolveResponse(data: unknown): SmeplugResolveAccountResult {
    if (data == null || typeof data !== 'object') {
      return { ok: false, message: 'Empty response' };
    }

    const root = data as Record<string, unknown>;

    if (root.status === false) {
      return { ok: false, message: String(root.message ?? 'Request failed') };
    }

    const payload =
      root.data != null && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>)
        : root;

    const accountNameRaw =
      payload.account_name ??
      payload.accountName ??
      payload.account_holder ??
      payload.accountHolderName ??
      payload.name;

    const nestedBank =
      payload.bank != null && typeof payload.bank === 'object'
        ? (payload.bank as Record<string, unknown>)
        : null;

    const bankNameRaw =
      payload.bank_name ??
      payload.bankName ??
      (typeof payload.bank === 'string' ? payload.bank : null) ??
      nestedBank?.name ??
      payload.institution_name ??
      payload.bank_institution;

    const accountName =
      accountNameRaw != null && String(accountNameRaw).trim() !== ''
        ? String(accountNameRaw).trim()
        : undefined;

    const bankName =
      bankNameRaw != null && String(bankNameRaw).trim() !== ''
        ? String(bankNameRaw).trim()
        : undefined;

    const explicitOk = root.status === true;
    if (explicitOk && accountName) {
      return { ok: true, accountName, bankName };
    }

    if (accountName) {
      return { ok: true, accountName, bankName };
    }

    return {
      ok: false,
      message: String(root.message ?? 'Unable to resolve account'),
    };
  }
}
