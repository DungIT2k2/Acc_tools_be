import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
    txId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
