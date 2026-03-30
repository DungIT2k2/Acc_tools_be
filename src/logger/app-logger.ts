import { ConsoleLogger, Injectable } from '@nestjs/common';
import { requestContext } from './request-context';

@Injectable()
export class AppLogger extends ConsoleLogger {
    private withTxId(message: unknown): string {
        const ctx = requestContext.getStore();
        const prefix = ctx?.txId ? `[${ctx.txId}] ` : '';
        return `${prefix}${message}`;
    }

    log(message: unknown, ...rest: unknown[]) {
        super.log(this.withTxId(message), ...rest);
    }

    error(message: unknown, ...rest: unknown[]) {
        super.error(this.withTxId(message), ...rest);
    }

    warn(message: unknown, ...rest: unknown[]) {
        super.warn(this.withTxId(message), ...rest);
    }

    debug(message: unknown, ...rest: unknown[]) {
        super.debug(this.withTxId(message), ...rest);
    }

    verbose(message: unknown, ...rest: unknown[]) {
        super.verbose(this.withTxId(message), ...rest);
    }
}
