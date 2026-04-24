// auth.middleware.ts
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AppLogger } from '../logger/app-logger';
import { requestContext } from '../logger/request-context';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    private readonly logger = new AppLogger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const { method, originalUrl, body } = req;
        const txId = randomUUID();
        const start = Date.now();

        req['txId'] = txId;
        res.setHeader('X-Transaction-Id', txId);

        requestContext.run({ txId }, () => {
            
            if (body?.password) {
                this.logger.log(`--> ${method} ${originalUrl} | payload: ${JSON.stringify({ ...body, password: '******' })}`);
            } else {
                this.logger.log(`--> ${method} ${originalUrl} | payload: ${JSON.stringify(body)}`);
            }

            res.on('finish', () => {
                const duration = Date.now() - start;
                this.logger.log(`<-- ${method} ${originalUrl} | status: ${res.statusCode} | ${duration}ms`);
            });

            next();
        });
    }
}

@Injectable()
export class VerifyMiddleware implements NestMiddleware {
    constructor(private readonly jwtService: JwtService) { };
    use(req: Request, res: Response, next: NextFunction) {
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            throw new UnauthorizedException('Not found token');
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = this.jwtService.verify(token);
            req['user'] = decoded;
            next();
        } catch (error) {
            throw new UnauthorizedException('Token Invalid');
        }
    }
}