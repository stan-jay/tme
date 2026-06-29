import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class RollbackService {
  async rollback(): Promise<never> {
    throw new NotImplementedException(
      'Rollback is unavailable because the current destination connector does not support verified compensation',
    );
  }

  getBackups(): never[] {
    return [];
  }
}
