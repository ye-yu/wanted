import { resolveStorage, WANT_FROM, WANTED_CONSTRUCTOR_SYMBOL, WANTED_FROM_SYMBOL, WANTED_INSTANCE_SYMBOL, WANTED_IS_PROXY_SYMBOL } from "./storage.ts";
import type { AnyArgsConstructor, NoArgsConstructor, WantableAsyncConstructor, WantableConstructor } from "./types.ts";

/**
 * Creates base class that requires `want` implementation
 */
export function Wantable<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableConstructor<Parent> {
  return (parent ?? class { }) as any
}

class NoopWant {
  want() { } // noop
}

/**
 * Creates base class can be instantantiated by constructor only
 */
export function WantableByConstructor(): WantableConstructor<NoopWant>
export function WantableByConstructor<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableConstructor<NoopWant & Parent>
export function WantableByConstructor(parent?: AnyArgsConstructor<any>): WantableConstructor<NoopWant> {
  if (parent) {
    return Wantable(class extends (parent as any) {
      want() { } // noop
    }) as any
  }
  return Wantable(NoopWant) as any
}

export function WantableAsync<Parent = unknown>(parent?: AnyArgsConstructor<Parent>): WantableAsyncConstructor<Parent> {
  return (parent ?? class { }) as any
}

function initProxy<T extends object>(wantedFrom: WANT_FROM) {
  return (wantable: NoArgsConstructor<T>) => {
    const realInstance = new wantable()
    resolveStorage(wantedFrom).setRealInstance(wantable, realInstance)
    const instance = new Proxy(Object.create(null), {
      get(target, prop) {
        if (prop === WANTED_IS_PROXY_SYMBOL) {
          return true
        }
        if (prop === WANTED_FROM_SYMBOL) {
          return wantedFrom
        }
        if (prop === WANTED_CONSTRUCTOR_SYMBOL) {
          return wantable
        }

        target = resolveStorage(wantedFrom).getRealInstance(wantable) || null

        if (prop === WANTED_INSTANCE_SYMBOL) {
          return target
        }
        return Reflect.get(target, prop)
      },
      set(target, prop, newValue) {
        target = resolveStorage(wantedFrom).getRealInstance(wantable) || null
        return Reflect.set(target, prop, newValue)
      }
    });
    return instance;
  }
}

/**
 * Instantiates, invokes `want()` method, and resolves circular dependencies.
 * 
 * `want()`ing from ASYNC_LOCAL will always return proxy. As a result, you can
 * want from global in your async local context, but you cannot want from
 * async local in your global context because the resolver will return null
 * instead.
 * 
 * For example,
 * 
 * ```ts
 * class IdProvider extends Wantable() {
 *  id = crypto.randomUUID()
 *  want() {}
 * }
 * 
 * class UserProvider extends Wantable() {
 *   idProvider!: IdProvider
 *   want() {
 *     this.idProvider = want(IdProvider, WANT_FROM.ASYNC_LOCAL)
 *   }
 * }
 * 
 * function logId() {
 *   const userProvider = want(UserProvider)
 *   // will fail outside of withAsyncLocalWantedStorage
 *   console.log(userProvider.idProvider.id) 
 * }
 * logId()
 * 
 * 
 * withAsyncLocalWantedStorage(() => {
 *   logId() // will run successfully
 * })
 * ```
 * 
 * @param wantable class extends Wantable
 * @param from WANT_FROM.GLOBAL or WANT_FROM.ASYNC_LOCAL
 * @returns instance of wantable
 */
export function want<
  T extends InstanceType<WantableConstructor>,
>(wantable: NoArgsConstructor<T>, from: WANT_FROM = WANT_FROM.GLOBAL): T {
  const storage = resolveStorage(from)
  if (storage.currentlyInWanted(wantable)) {
    return storage.getProxyFromStorage(wantable)
  }
  if (storage.alreadyWanted(wantable)) {
    if (from === WANT_FROM.ASYNC_LOCAL) {
      return storage.getProxyFromStorage(wantable);
    }
    return storage.getRealInstance(wantable);
  }

  storage.addToWanted(wantable)
  const instance = storage.getOrComputeProxyFromStorage(wantable, initProxy(from))
  instance.want();
  storage.exitAfterWanted(from)

  if (from === WANT_FROM.ASYNC_LOCAL) {
    return instance // is proxy anyway
  }
  return storage.getRealInstance(wantable);
}

/**
 * Instantiates, invokes `want()` method, and resolves circular dependencies.
 * 
 * `want()`ing from ASYNC_LOCAL will always return proxy. As a result, you can
 * want from global in your async local context, but you cannot want from
 * async local in your global context because the resolver will return null
 * instead.
 * 
 * For example,
 * 
 * ```ts
 * class IdProvider extends Wantable() {
 *  id = crypto.randomUUID()
 *  want() {}
 * }
 * 
 * class UserProvider extends Wantable() {
 *   idProvider!: IdProvider
 *   want() {
 *     this.idProvider = want(IdProvider, WANT_FROM.ASYNC_LOCAL)
 *   }
 * }
 * 
 * function logId() {
 *   const userProvider = want(UserProvider)
 *   // will fail outside of withAsyncLocalWantedStorage
 *   console.log(userProvider.idProvider.id) 
 * }
 * logId()
 * 
 * 
 * withAsyncLocalWantedStorage(() => {
 *   logId() // will run successfully
 * })
 * ```
 * 
 * @param wantable class extends Wantable
 * @param from WANT_FROM.GLOBAL or WANT_FROM.ASYNC_LOCAL
 * @returns instance of wantable
 */
export async function wantAsync<
  T extends InstanceType<WantableAsyncConstructor>
>(wantable: NoArgsConstructor<T>, from: WANT_FROM = WANT_FROM.GLOBAL): Promise<T> {
  const storage = resolveStorage(from)
  if (storage.currentlyInWanted(wantable)) {
    return storage.getProxyFromStorage(wantable)
  }
  if (storage.alreadyWanted(wantable)) {
    if (from === WANT_FROM.ASYNC_LOCAL) {
      return storage.getProxyFromStorage(wantable);
    }
    return storage.getRealInstance(wantable);
  }

  storage.addToWanted(wantable)
  const instance = storage.getOrComputeProxyFromStorage(wantable, initProxy(from))
  await instance.wantAsync();
  storage.exitAfterWanted(from)

  if (from === WANT_FROM.ASYNC_LOCAL) {
    return instance // is proxy anyway
  }
  return storage.getRealInstance(wantable);
}
