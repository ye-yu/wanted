import type { NoArgsConstructor } from "./types.ts";
import { AsyncLocalStorage } from 'node:async_hooks';
// symbols
export const WANTED_INSTANCE_SYMBOL = Symbol.for('WANTED_INSTANCE_SYMBOL')
export const WANTED_IS_PROXY_SYMBOL = Symbol.for('WANTED_IS_PROXY_SYMBOL')
export const WANTED_FROM_SYMBOL = Symbol.for('WANTED_FROM_SYMBOL')
export const WANTED_CONSTRUCTOR_SYMBOL = Symbol.for('WANTED_CONSTRUCTOR_SYMBOL')
export const WANTED_GLOBAL_STORAGE = Symbol.for('WANTED_GLOBAL_STORAGE')

export const WANT_FROM = {
  GLOBAL: 'GLOBAL',
  ASYNC_LOCAL: 'ASYNC_LOCAL'
} as const
export type WANT_FROM = keyof typeof WANT_FROM
export function resolveStorage(from: WANT_FROM) {
  switch (from) {
    case "ASYNC_LOCAL": {
      const storage = ASYNC_LOCAL_WANTED_STORAGE.getStore()
      if (!storage) {
        throw new Error("Async local wanted storage is not initialized with initAsyncLocalWantedStorage()")
      }
      return storage
    }
    case "GLOBAL": return GLOBAL_WANTED_STORAGE
  }
}

class WantedStorage {
  readonly WANTED_SYNC_STORAGE = new Set<NoArgsConstructor<any>>();
  WANTED_COUNTER = 0
  alreadyWanted(wantable: NoArgsConstructor<any>) {
    return this.WANT_INSTANCE_STORAGE.has(wantable)
  }
  currentlyInWanted(wantable: NoArgsConstructor<any>): boolean {
    return this.WANTED_SYNC_STORAGE.has(wantable)
  }
  addToWanted(wantable: NoArgsConstructor<any>): void {
    this.WANTED_SYNC_STORAGE.add(wantable)
    this.WANTED_COUNTER++
  }
  exitAfterWanted(from: WANT_FROM) {
    this.WANTED_COUNTER--
    if (this.WANTED_COUNTER !== 0) return
    if (from === WANT_FROM.ASYNC_LOCAL) {
      this.WANTED_SYNC_STORAGE.clear()
      return

    }
    for (const constructor of this.WANTED_SYNC_STORAGE) {
      const realInstance = this.WANT_INSTANCE_STORAGE.get(constructor)
      for (const prop of Object.getOwnPropertyNames(realInstance)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(realInstance, prop)
        const value = descriptor?.value
        if (!value || typeof value !== "object") continue
        const isProxy = Reflect.get(value, WANTED_IS_PROXY_SYMBOL)
        if (!isProxy) continue
        const fromAsyncLocal = Reflect.get(value, WANTED_FROM_SYMBOL) === WANT_FROM.ASYNC_LOCAL
        if (fromAsyncLocal) continue
        const depsRealInstance = this.WANT_INSTANCE_STORAGE.get(value.constructor) ||
          (console.warn("Constructor", constructor.name, "not in real instance storage! Dependency chain:", [...this.WANTED_SYNC_STORAGE])
            , Reflect.get(value, WANTED_INSTANCE_SYMBOL))
        Object.defineProperty(realInstance, prop, { ...descriptor, value: depsRealInstance })
      }
    }
    this.WANTED_SYNC_STORAGE.clear()
    return
  }


  // registries
  WANT_PROXY_STORAGE = new WeakMap<NoArgsConstructor<any>>();
  WANT_INSTANCE_STORAGE = new WeakMap<NoArgsConstructor<any>>();
  getOrComputeProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => T): T
  getOrComputeProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => Promise<T>): Promise<T>
  getOrComputeProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => any): any {
    return this.WANT_PROXY_STORAGE.getOrInsertComputed(noArgsConstructor, computer)
  }

  getProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>): T
  getProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>, promise: 'promise'): Promise<T>
  getProxyFromStorage<T>(noArgsConstructor: NoArgsConstructor<T>): any {
    return this.WANT_PROXY_STORAGE.get(noArgsConstructor)
  }

  setRealInstance<T>(noArgsConstructor: NoArgsConstructor<T>, instance: T) {
    return this.WANT_INSTANCE_STORAGE.set(noArgsConstructor, instance)
  }

  getRealInstance<T>(noArgsConstructor: NoArgsConstructor<T>): T {
    return this.WANT_INSTANCE_STORAGE.get(noArgsConstructor)
  }
}

let ASYNC_LOCAL_WANTED_STORAGE = new AsyncLocalStorage<WantedStorage>();
let GLOBAL_WANTED_STORAGE = new WantedStorage()
export function withAsyncLocalWantedStorage(cb: () => void | PromiseLike<void>) {
  ASYNC_LOCAL_WANTED_STORAGE.run(new WantedStorage(), () => {
    Promise.resolve(cb())
  })
}

export function clearAllWants() {
  ASYNC_LOCAL_WANTED_STORAGE = new AsyncLocalStorage<WantedStorage>();
  GLOBAL_WANTED_STORAGE = new WantedStorage();
}
export function getGlobalWantedStorage() {
  return GLOBAL_WANTED_STORAGE
}
export function getAsyncLocalWantedStorage() {
  return ASYNC_LOCAL_WANTED_STORAGE
}
