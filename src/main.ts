import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AppModule } from './app.module';
import type { Env } from './config';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  // Visiting http://localhost:PORT/ should not 404 — send humans to Swagger.
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: unknown) => void;
    get: (
      path: string,
      handler: (req: Request, res: Response) => void,
    ) => void;
  };
  // Behind a load balancer the throttler must key on the real client IP,
  // not the proxy's — otherwise one attacker can exhaust everyone's login
  // budget. Set TRUST_PROXY_HOPS to the number of proxies in front.
  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) {
    expressApp.set('trust proxy', trustProxyHops);
  }
  expressApp.get('/', (_req, res) => {
    res.redirect(302, '/docs');
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Elevator ERP API')
    .setDescription(
      'Multi-tenant Cloud SaaS ERP for elevator & electromechanical companies. ' +
        'Authenticate via POST /v1/auth/login, then click Authorize and paste the accessToken.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addTag('health', 'Liveness probe')
    .addTag('dashboard', 'Pipeline and workload figures for the home page')
    .addTag('auth', 'Login, refresh, logout, and current user')
    .addTag('customers', 'CRM customers')
    .addTag('projects', 'Sales project pipeline')
    .addTag('employees', 'Staff directory and roles')
    .addTag('assets', 'Registered elevators, stairs, and other equipment')
    .addTag('notifications', 'In-app notification inbox')
    .addTag('maintenance', 'Service contracts, visits, and breakdowns')
    .addTag('settings', 'Tenant branding and language')
    .addTag('elevator-specs', 'Technical specification and pricing calculator')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    // Keep Swagger outside the /v1 global prefix so the UI lives at /docs.
    useGlobalPrefix: false,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/v1`, 'Bootstrap');
  Logger.log(`Swagger UI at http://localhost:${port}/docs`, 'Bootstrap');
};

void bootstrap();
