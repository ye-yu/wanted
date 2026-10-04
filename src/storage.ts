import type { NoArgsConstructor } from "./types.ts";
import { AsyncLocalStorage } from 'node:async_hooks';
// symbols
export const WANTED_INSTANCE_SYMBOL = Symbol.for('WANTED_INSTANCE_SYMBOL')
export const WANTED_IS_PROXY_SYMBOL = Symbol.for('WANTED_IS_PROXY_SYMBOL')
export const WANTED_GLOBAL_STORAGE = Symbol.for('WANTED_GLOBAL_STORAGE')

export const WANT_FROM = {
  GLOBAL: 'GLOBAL',
  ASYNC_LOCAL: 'ASYNC_LOCAL'
} as const
export type WANT_FROM = keyof typeof WANT_FROM
let initiallyWantingFrom: WANT_FROM | undefined = undefined
export function resolveStorage(from: WANT_FROM) {
  if (!initiallyWantingFrom) {
    initiallyWantingFrom = from
  } else if (initiallyWantingFrom === WANT_FROM.GLOBAL && from === WANT_FROM.ASYNC_LOCAL) {
    throw new Error("Cannot want from async session while initially wanting from global")
  }
  switch(from) {
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
  alreadyWanted(wantable: NoArgsConstructor<any>): boolean {
    return this.WANTED_SYNC_STORAGE.has(wantable)
  }
  addToWanted(wantable: NoArgsConstructor<any>): void {
    this.WANTED_SYNC_STORAGE.add(wantable)
    this.WANTED_COUNTER++
  }
  exitAfterWanted() {
    this.WANTED_COUNTER--
    if (this.WANTED_COUNTER !== 0) return
    for (const constructor of this.WANTED_SYNC_STORAGE) {
      const instance = this.WANT_GLOBAL_CONSTRUCTOR_STORAGE.get(constructor)
      if (!instance) {
        throw new Error("Something went wrong when trying to unproxy instances: instance or proxy is not stored after wanting")
      }
      if (Reflect.get(instance, WANTED_IS_PROXY_SYMBOL)) {
        const realInstance = Reflect.get(instance, WANTED_INSTANCE_SYMBOL)
        this.WANT_GLOBAL_CONSTRUCTOR_STORAGE.set(constructor, realInstance)
      }
      for (const prop of Object.getOwnPropertyNames(instance)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(instance, prop)
        const value = descriptor?.value
        if (!value || typeof value !== "object") continue
        const isProxy = Reflect.get(value, WANTED_IS_PROXY_SYMBOL)
        if (!isProxy) continue
        const realInstance = Reflect.get(value, WANTED_INSTANCE_SYMBOL)
        Object.defineProperty(instance, prop, { ...descriptor, value: realInstance })
      }
    }
    this.WANTED_SYNC_STORAGE.clear()
    initiallyWantingFrom = undefined
    return
  }


  // registries
  WANT_GLOBAL_CONSTRUCTOR_STORAGE = new WeakMap<NoArgsConstructor<any>>();
  getOrComputeGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => T): T
  getOrComputeGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => Promise<T>): Promise<T>
  getOrComputeGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>, computer: (key: NoArgsConstructor<T>) => any): any {
    return this.WANT_GLOBAL_CONSTRUCTOR_STORAGE.getOrInsertComputed(noArgsConstructor, computer)
  }

  getGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>): T
  getGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>, promise: 'promise'): Promise<T>
  getGlobalStorage<T>(noArgsConstructor: NoArgsConstructor<T>): any {
    return this.WANT_GLOBAL_CONSTRUCTOR_STORAGE.get(noArgsConstructor)
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
