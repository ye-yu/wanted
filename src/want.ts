import { resolveStorage, WANT_FROM, WANTED_INSTANCE_SYMBOL, WANTED_IS_PROXY_SYMBOL } from "./storage.ts";
import type { AnyArgsConstructor, NoArgsConstructor, WantableAsyncConstructor, WantableConstructor } from "./types.ts";

/**
 * Creates base class that requires `want` implementation
 */
export function Wantable<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableConstructor<Parent> {
  return (parent ?? class { }) as any
}

class NoopWant {
  want() {} // noop
}

/**
 * Creates base class can be instantantiated by constructor only
 */
export function WantableByConstructor<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableConstructor<Parent> {
  if (parent) {
    return Wantable(class extends (parent as any) {
      want() {} // noop
    }) as any
  }
  return Wantable(NoopWant) as any
}

export function WantableAsync<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableAsyncConstructor<Parent> {
  return (parent ?? class { }) as any
}

function initProxy<T extends object>() {
  return (wantable: NoArgsConstructor<T>) => {
    const realInstance = new wantable()
    const instance = new Proxy(realInstance, {
      get(target, prop, receiver) {
        if (prop === WANTED_INSTANCE_SYMBOL) {
          return realInstance
        }
        if (prop === WANTED_IS_PROXY_SYMBOL) {
          return true
        }
        return Reflect.get(target, prop, receiver)
      }
    });
    return instance;
  }
}

/**
 * Instantiates, invokes `want()` method, and resolves circular dependencies
 * 
 * Note: you can want from global in your async local context, but you cannot
 * want from async local in your global context
 * 
 * For example, if your dependencies look like this:
 * 
 * ```
 * wantFromAsyncLocal -> wantFromAsyncLocal -> wantFromGlobal -> wantFromAsyncLocal
 * ```
 * 
 * Because you start with wantFromAsync local, the third dependencies wantFromGlobal
 * will work just fine. However, if your dependencies starts with global and then
 * somewhere along the dependencies chain, you wanted from async local, the
 * dependencies instantiation will fail. For example, this will not work:
 * 
 * ```
 * wantFromGlobal -> wantFromAsyncLocal -> wantFromGlobal
 * ```
 * @param wantable class extends Wantable
 * @param from WANT_FROM.GLOBAL or WANT_FROM.ASYNC_LOCAL
 * @returns instance of wantable
 */
export function want<
  T extends InstanceType<WantableConstructor>,
>(wantable: NoArgsConstructor<T>, from: WANT_FROM = WANT_FROM.GLOBAL): T {
  const storage = resolveStorage(from)
  if (storage.alreadyWanted(wantable)) {
    return storage.getGlobalStorage(wantable)
  }

  storage.addToWanted(wantable)
  const instance = storage.getOrComputeGlobalStorage(wantable, initProxy())
  instance.want();
  storage.exitAfterWanted()
  return Reflect.get(instance, WANTED_IS_PROXY_SYMBOL) ?
    Reflect.get(instance, WANTED_INSTANCE_SYMBOL) as any
    : instance;
}

/**
 * Instantiates, invokes `wantAsync()` method, and resolves circular dependencies
 * 
 * Note: you can want from global in your async local context, but you cannot
 * want from async local in your global context
 * 
 * For example, if your dependencies look like this:
 * 
 * ```
 * wantFromAsyncLocal -> wantFromAsyncLocal -> wantFromGlobal -> wantFromAsyncLocal
 * ```
 * 
 * Because you start with wantFromAsync local, the third dependencies wantFromGlobal
 * will work just fine. However, if your dependencies starts with global and then
 * somewhere along the dependencies chain, you wanted from async local, the
 * dependencies instantiation will fail. For example, this will not work:
 * 
 * ```
 * wantFromGlobal -> wantFromAsyncLocal -> wantFromGlobal
 * ```
 * @param wantable class extends WantableAsync
 * @param from WANT_FROM.GLOBAL or WANT_FROM.ASYNC_LOCAL
 * @returns instance of wantable
 */
export async function wantAsync<
  T extends InstanceType<WantableAsyncConstructor>
>(wantable: NoArgsConstructor<T>, from: WANT_FROM = WANT_FROM.GLOBAL): Promise<T> {
  const storage = resolveStorage(from)
  if (storage.alreadyWanted(wantable)) {
    return await storage.getGlobalStorage(wantable, 'promise')
  }

  storage.addToWanted(wantable)
  const instance = storage.getOrComputeGlobalStorage(wantable, initProxy())
  await instance.wantAsync();
  storage.exitAfterWanted()
  return Reflect.get(instance, WANTED_IS_PROXY_SYMBOL) ?
    Reflect.get(instance, WANTED_INSTANCE_SYMBOL) as any
    : instance;
}
