import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { ApiKeyRequest, ApiKeyRequestContext } from '../guards/api-key.guard';

export const ApiKeyContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyRequestContext => {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    if (!request.apiKey) {
      throw new Error('ApiKeyContext used without ApiKeyGuard');
    }

    return request.apiKey;
  },
);
