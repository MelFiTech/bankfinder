import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SmeplugService } from './smeplug.service';

@Module({
  imports: [HttpModule],
  providers: [SmeplugService],
  exports: [SmeplugService],
})
export class SmeplugModule {}
