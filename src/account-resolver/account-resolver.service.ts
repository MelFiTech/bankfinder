import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Observable, catchError, map, firstValueFrom, of, forkJoin, race, timer } from 'rxjs';
import { AxiosError } from 'axios';

type Bank = {
  code: string;
  name: string;
};

type AccountNameResult = {
  accountName: string;
  bankName: string;
};

@Injectable()
export class AccountResolverService {
  private readonly logger = new Logger(AccountResolverService.name);
  private readonly apiUrl = 'https://integrations.getravenbank.com/v1';
  private readonly authToken = 'RVSEC-37d856b183843d0aa450c4da2aec647ee572924a860cf080862524ba3fec617a18e5eb825330a626460fb08c3ccdd44e-1716828515065';

  private readonly bankList: Bank[] = [
    { code: "100004", name: "Opay" },
    { code: "090267", name: "Kuda" },
    { code: "50515", name: "Moniepoint" },
    { code: "044", name: "Access Bank Plc" },
    { code: "023", name: "Citibank Nigeria Limited" },
    { code: "050", name: "Ecobank Nigeria Plc" },
    { code: "070", name: "Fidelity Bank Plc" },
    { code: "011", name: "First Bank Nigeria Limited" },
    { code: "214", name: "First City Monument Bank Plc" },
    { code: "058", name: "Guaranty Trust Bank Plc" },
    { code: "030", name: "Heritage Banking Company Ltd." },
    { code: "082", name: "Keystone Bank Limited" },
    { code: "060003", name: "Nova Merchant Bank" },
    { code: "000036", name: "Optimus Bank" },
    { code: "000030", name: "Parallex Bank Ltd" },
    { code: "076", name: "Polaris Bank Plc" },
    { code: "000031", name: "PremiumTrust Bank" },
    { code: "101", name: "ProvidusBank PLC" },
    { code: "000034", name: "SIGNATURE BANK" },
    { code: "221", name: "Stanbic IBTC Bank Plc" },
    { code: "068", name: "Standard Chartered Bank Nigeria Ltd." },
    { code: "232", name: "Sterling Bank Plc" },
    { code: "100", name: "Suntrust Bank" },
    { code: "000025", name: "Titan Trust Bank" },
    { code: "032", name: "Union Bank of Nigeria Plc" },
    { code: "033", name: "United Bank For Africa Plc" },
    { code: "215", name: "Unity Bank Plc" },
    { code: "035", name: "Wema Bank Plc" },
    { code: "057", name: "Zenith Bank Plc" },
    { code: "100033", name: "PALMPAY" },
    { code: "090620", name: "LOMA Microfinance Bank" },
    // Adding more banks
    { code: "120001", name: "9 Payment Service Bank" },
    { code: "000027", name: "Globus Bank" },
    { code: "000028", name: "Central Bank Of Nigeria" },
    { code: "000029", name: "Lotus Bank" },
    { code: "000033", name: "ENaira" },
    { code: "000037", name: "ALTERNATIVE BANK LIMITED" },
    { code: "090001", name: "ASOSavings & Loans" },
    { code: "090110", name: "VFD Micro Finance Bank" },
    { code: "090115", name: "IBANK Microfinance Bank" },
    { code: "090134", name: "Accion Microfinance Bank" },
    { code: "090136", name: "Baobab Microfinance Bank" },
    { code: "090194", name: "NIRSAL Microfinance Bank" },
    { code: "090205", name: "New Dawn Microfinance Bank" },
    { code: "090251", name: "UNN MFB" },
    { code: "090270", name: "AB Microfinance Bank" },
    { code: "090325", name: "Sparkle" },
    { code: "090328", name: "Eyowo MFB" },
    { code: "090405", name: "Moniepoint Microfinance Bank" },
    { code: "090426", name: "Tangerine Bank" },
    { code: "090551", name: "Fairmoney Microfinance Bank Ltd" },
    { code: "100026", name: "Carbon" },
    { code: "120002", name: "Hopepsb" },
    { code: "120003", name: "Momo Psb" },
    { code: "120004", name: "Smartcash Payment Service Bank" },
    { code: "301", name: "Jaiz Bank" },
    { code: "327", name: "Paga" },
    { code: "502", name: "Rand merchant Bank" }
  ];

  constructor(private httpService: HttpService) {}

  async resolveBank(accountNumber: string): Promise<Bank[]> {
    this.logger.log(`Attempting to resolve bank for account: ${accountNumber}`);
    
    // First, check the provided bank list (2 seconds)
    const initialResults = await this.checkProvidedBanks(accountNumber);
    
    if (initialResults.length > 0) {
      return initialResults;
    }

    // If not found, check the extended bank list (additional 3 seconds)
    this.logger.log('Account not found in provided bank list. Checking extended list.');
    return this.checkExtendedBankList(accountNumber);
  }

  private async checkProvidedBanks(accountNumber: string): Promise<Bank[]> {
    const requests = this.bankList.map(bank => 
      this.checkBankAccount(bank, accountNumber)
    );

    const results = await firstValueFrom(
      race([
        forkJoin(requests),
        timer(2000).pipe(map(() => null))
      ])
    );

    if (results === null) {
      this.logger.warn('Bank resolution timed out after 2 seconds');
      return [];
    }

    return results.filter((result): result is Bank => result !== null);
  }

  private async checkExtendedBankList(accountNumber: string): Promise<Bank[]> {
    try {
      const extendedBanks = await this.getExtendedBankList();
      const requests = extendedBanks.map(bank => 
        this.checkBankAccount(bank, accountNumber)
      );

      const results = await firstValueFrom(
        race([
          forkJoin(requests),
          timer(3000).pipe(map(() => null))
        ])
      );

      if (results === null) {
        this.logger.warn('Extended bank resolution timed out after 3 seconds');
        return [];
      }

      return results.filter((result): result is Bank => result !== null);
    } catch (error) {
      this.logger.error(`Error checking extended bank list: ${error.message}`);
      return [];
    }
  }

  private async getExtendedBankList(): Promise<Bank[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/banks`, {
          headers: this.getHeaders()
        })
      );
      return response.data.data.map(bank => ({ code: bank.code, name: bank.name }));
    } catch (error) {
      this.logger.error(`Error fetching extended bank list: ${error.message}`);
      throw error;
    }
  }

  private checkBankAccount(bank: Bank, accountNumber: string): Observable<Bank | null> {
    return this.httpService.post(`${this.apiUrl}/account_number_lookup`, {
      bank: bank.code,
      account_number: accountNumber
    }, {
      headers: this.getHeaders(),
      timeout: 1900 // Slightly less than 2 seconds to allow for processing time
    }).pipe(
      map(response => {
        if (response.data.status === 'success') {
          return bank;
        }
        return null;
      }),
      catchError((error: AxiosError) => {
        this.logger.warn(`Error checking account for ${bank.name}: ${error.message}`);
        return of(null);
      })
    );
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.authToken}`,
      'accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async lookupAccountName(bankCode: string, accountNumber: string): Promise<AccountNameResult> {
    this.logger.log(`Looking up account name for bank code ${bankCode} and account number ${accountNumber}`);
    
    try {
      const result = await firstValueFrom(this.performAccountNameLookup(bankCode, accountNumber));
      return result;
    } catch (error) {
      this.logger.error(`Error looking up account name: ${error.message}`);
      throw error;
    }
  }

  private performAccountNameLookup(bankCode: string, accountNumber: string): Observable<AccountNameResult> {
    return this.httpService.post(`${this.apiUrl}/account_number_lookup`, {
      bank: bankCode,
      account_number: accountNumber
    }, {
      headers: this.getHeaders(),
    }).pipe(
      map(response => {
        if (response.data.status === 'success' && response.data.data && response.data.data.account_name) {
          return {
            accountName: response.data.data.account_name,
            bankName: response.data.data.bank_name || 'Unknown Bank'
          };
        }
        throw new Error('Unable to resolve account name');
      }),
      catchError((error: AxiosError) => {
        this.logger.error(`Error in account name lookup: ${error.message}`);
        throw error;
      })
    );
  }
}