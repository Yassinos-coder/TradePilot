import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  positionProxyCloseSchema,
  positionProxyModifySchema,
  positionProxyOpenSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { PositionProxyService } from './position-proxy.service';

const NONCE_TTL_MS = 10 * 60 * 1000;
const TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

@Controller('position-proxy')
export class PositionProxyController {
  private readonly nonces = new Map<string, number>();

  constructor(
    private readonly proxy: PositionProxyService,
    private readonly configService: ConfigService,
  ) {}

  @Get('positions')
  listPositions(
    @Headers('x-tradepilot-proxy-key') apiKey: string | undefined,
    @Headers('x-tradepilot-proxy-timestamp') timestamp: string | undefined,
    @Headers('x-tradepilot-proxy-nonce') nonce: string | undefined,
    @Headers('x-tradepilot-proxy-signature') signature: string | undefined,
    @Query('accountId') accountId?: string,
  ) {
    const userId = this.authenticate(apiKey, timestamp, nonce, signature, {});
    if (!accountId) {
      throw new ServiceUnavailableException('accountId query parameter is required');
    }
    return this.proxy.listOpenPositions(userId, accountId);
  }



  @UseGuards(JwtAuthGuard)
  @Get('trade/positions')
  listUserPositions(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
  ) {
    if (!accountId) {
      throw new ServiceUnavailableException('accountId query parameter is required');
    }
    return this.proxy.listOpenPositions(user.userId, accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trade/open')
  openUserPosition(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(positionProxyOpenSchema)) body: unknown,
  ) {
    return this.proxy.openPosition(user.userId, positionProxyOpenSchema.parse(body));
  }

  @Post('open')
  openPosition(
    @Headers('x-tradepilot-proxy-key') apiKey: string | undefined,
    @Headers('x-tradepilot-proxy-timestamp') timestamp: string | undefined,
    @Headers('x-tradepilot-proxy-nonce') nonce: string | undefined,
    @Headers('x-tradepilot-proxy-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const userId = this.authenticate(apiKey, timestamp, nonce, signature, body);
    return this.proxy.openPosition(userId, positionProxyOpenSchema.parse(body));
  }

  @Post('close')
  closePosition(
    @Headers('x-tradepilot-proxy-key') apiKey: string | undefined,
    @Headers('x-tradepilot-proxy-timestamp') timestamp: string | undefined,
    @Headers('x-tradepilot-proxy-nonce') nonce: string | undefined,
    @Headers('x-tradepilot-proxy-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const userId = this.authenticate(apiKey, timestamp, nonce, signature, body);
    return this.proxy.closePosition(userId, positionProxyCloseSchema.parse(body));
  }

  @Post('modify')
  modifyPosition(
    @Headers('x-tradepilot-proxy-key') apiKey: string | undefined,
    @Headers('x-tradepilot-proxy-timestamp') timestamp: string | undefined,
    @Headers('x-tradepilot-proxy-nonce') nonce: string | undefined,
    @Headers('x-tradepilot-proxy-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const userId = this.authenticate(apiKey, timestamp, nonce, signature, body);
    return this.proxy.modifyPosition(userId, positionProxyModifySchema.parse(body));
  }

  private authenticate(
    apiKey: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
    signature: string | undefined,
    body: unknown,
  ) {
    const expectedKey = this.configService.get<string>('TRADEPILOT_PROXY_API_KEY');
    const hmacSecret = this.configService.get<string>('TRADEPILOT_PROXY_HMAC_SECRET');
    const userId =
      this.configService.get<string>('TRADEPILOT_PROXY_USER_ID') ??
      this.configService.get<string>('TRADEPILOT_ANALYTICS_USER_ID');

    if (!expectedKey || !userId) {
      throw new ServiceUnavailableException('TradePilot position proxy API is not configured');
    }

    if (!apiKey || !this.safeEqual(apiKey, expectedKey)) {
      throw new UnauthorizedException('Invalid position proxy API key');
    }

    if (!hmacSecret) {
      return userId;
    }

    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedException('Missing HMAC authentication headers');
    }

    const requestTime = Number(timestamp);
    if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > TIMESTAMP_SKEW_MS) {
      throw new UnauthorizedException('Expired position proxy request timestamp');
    }

    this.pruneNonces();
    if (this.nonces.has(nonce)) {
      throw new UnauthorizedException('Replay detected: nonce already used');
    }

    const bodyDigest = createHash('sha256').update(this.stableStringify(body)).digest('hex');
    const canonical = `${timestamp}.${nonce}.${bodyDigest}`;
    const expectedSignature = createHmac('sha256', hmacSecret).update(canonical).digest('hex');

    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid position proxy signature');
    }

    this.nonces.set(nonce, Date.now() + NONCE_TTL_MS);
    return userId;
  }

  private pruneNonces() {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.nonces.entries()) {
      if (expiresAt <= now) {
        this.nonces.delete(nonce);
      }
    }
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',')}}`;
  }
}
